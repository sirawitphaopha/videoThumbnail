// เทสขั้น 6 ตรวจไฟล์ ในหน้าต่างโปรแกรมจริง (แผนขั้น 6 ตารางเทส · สเปกข้อ 8)
// ใช้: node scripts/check-stage6.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1)
//      node scripts/check-stage6.mjs --built  (โปรแกรมที่สร้างจริง scripts/dev-app.ps1 -Built) เช็กเพิ่มว่าหน้าโหลดจากตัวโปรแกรม
//      และไม่มีอะไรโดนกติกาความปลอดภัย (CSP) ตัวจริงกันตลอดการเทส (TECH-REVIEW ข้อ 5) · ภาพเก็บแยกที่ ขั้น6-ตัวจริง
// ผ่านเมื่อ ไฟล์ดีผลเป็นสมบูรณ์ · ไฟล์เสียกลางเรื่องจับได้ นาทีห่างจากจุดจริงไม่เกิน 5 วินาที · ไฟล์ขาดท้ายจับได้
//          แก้ไฟล์ 1 ไบต์แล้วตรวจแบบเร็วขึ้นไฟล์ถูกเปลี่ยน · ปุ่มเปิดเล่นที่นาทีส่งเวลาถูกให้โปรแกรมเล่น · ป้ายสีบนชั้นเปลี่ยนตามผล
import { mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, readFileSync, openSync, readSync, writeSync, closeSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const SRC = join("test-media", "สร้าง", "หนัง");
// โฟลเดอร์ชื่อใหม่ทุกรอบ · คัดลอกไฟล์ทับที่อยู่เดิม Windows เก็บเวลาแก้ไขเดิมไว้ ตัวอ่านโฟลเดอร์ถือว่าเป็นไฟล์เดิม ผลตรวจรอบก่อนติดมา
// คลังทิ้งหนังของโฟลเดอร์ที่ไม่ได้ตั้งไว้แล้ว ใช้ชื่อใหม่จึงได้คลังสะอาด
const TMP = "D:\\dev\\tmp";
for (const d of readdirSync(TMP)) if (d.startsWith("ชั้นตรวจไฟล์")) rmSync(join(TMP, d), { recursive: true, force: true });
const DIR = join(TMP, `ชั้นตรวจไฟล์-${Date.now()}`);
const FAKE = "D:\\dev\\tmp\\fakeplayer";
const BUILT = process.argv.includes("--built");
const OUT = BUILT ? "docs/report-2026-11-07/ขั้น6-ตัวจริง" : "docs/report-2026-11-07/ขั้น6";
const LIB = join(process.env.APPDATA, "com.pkh.movieshelf", "library.json");
mkdirSync(OUT, { recursive: true });
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
for (const f of ["ดาวเหนือ (2023).mkv", "เสียกลางเรื่อง (2022).mkv", "ขาดท้าย (2022).mkv", "The Last Orchard (2022).mp4", "บ้านริมคลอง (2017).ts"]) copyFileSync(join(SRC, f), join(DIR, f));
copyFileSync(join(SRC, "ดาวเหนือ (2023).mkv"), join(DIR, "แก้หนึ่งไบต์ (2023).mkv"));
// วิดีโอจริงยาว 4 นาที 21 วินาที ไว้ถ่ายภาพตอนกำลังตรวจ กับเทสหยุดกลางทาง · ชื่อเปลี่ยนเป็นชื่อกลาง ๆ ภาพขึ้นรายงาน
const LONG = join("test-media", "จากพี่กัน", "TED-Ed เมนเดเลเยฟ.mp4");
const hasLong = existsSync(LONG);
if (hasLong) copyFileSync(LONG, join(DIR, "วิดีโอยาว (2024).mp4"));
const truth = JSON.parse(readFileSync(join(SRC, "เสียกลางเรื่อง (2022).json"), "utf8"));
// โปรแกรมเล่นจำลอง · จดข้อโต้แย้งที่ได้รับลงไฟล์ (เครื่องนี้ไม่มี VLC MPC-HC PotPlayer mpv)
rmSync(FAKE, { recursive: true, force: true });
mkdirSync(FAKE, { recursive: true });
writeFileSync(join(FAKE, "vlc-fake.cmd"), `@echo %* > "${FAKE}\\args.txt"\r\n`);

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const shot = async (f, sel) => { await c.move(100, 700); await sleep(250); return c.shot(`${OUT}/${f}`, sel, 0); };
const waitFor = async (js, ms = 30000) => { for (let t = 0; t < ms; t += 150) { if (await q(js)) return true; await sleep(150); } return false; };
const rowText = (name) => q(`return document.querySelector('[data-ckrow=${JSON.stringify(name)}]')?.innerText.replace(/\\s+/g, ' ') ?? ''`);
const clickText = (sel, text) => c.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.innerText.includes(${JSON.stringify(text)}))?.click()`);
const closeToasts = () => c.evaluate("document.querySelectorAll('.toast .x, .toast button').forEach(b => b.click())");
const idle = () => waitFor("return !document.querySelector('[data-ckstop]')", 120000);
const goCheck = async () => { await clickText("button.nav", "ตรวจไฟล์"); await waitFor("return !!document.querySelector('[data-check] table.ck tbody tr[data-ckrow]')"); await sleep(200); };
const selectOnly = async (names) => {
  // ช่องติ๊กหัวตาราง ตอนเลือกบางเรื่องกดแล้วเลือกทั้งหมด กดอีกทีถึงล้าง · รอหน้าจอเปลี่ยนก่อนอ่านทุกครั้ง
  for (let i = 0; i < 3; i++) {
    if ((await q("return document.querySelector('table.ck thead .cbx').getAttribute('aria-checked')")) === "false") break;
    await c.evaluate("document.querySelector('table.ck thead .cbx').click()");
    await sleep(200);
  }
  for (const n of names) await c.evaluate(`document.querySelector('[data-ckrow=${JSON.stringify(n)}] .cbx').click()`);
  await sleep(150);
};
const mode = (m) => clickText(".mode", m === "quick" ? "ตรวจแบบเร็ว" : "ตรวจละเอียด");
const startCheck = async () => { await c.evaluate("document.querySelector('[data-ckstart]').click()"); await waitFor("return !!document.querySelector('[data-ckstop]')", 5000); };

await inv("set_settings", { patch: { folders: [DIR], playerPath: "", recheckReminderDays: 30, defaultCheck: "quick", quickCheckOnStart: false } });
if (BUILT) {
  // จดทุกครั้งที่กติกาความปลอดภัยกันของ ตั้งแต่ก่อนหน้าโหลด · ตัวเทสโหลดหน้าใหม่ครั้งเดียวบรรทัดถัดไป จึงครอบทั้งการเทส
  await c.send("Page.enable");
  await c.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ dir: e.violatedDirective, uri: e.blockedURI, sample: e.sample }));",
  });
}
await c.evaluate("location.hash = ''; location.reload()"); await sleep(2500);
if (BUILT) {
  const origin = await q("return location.origin");
  check("ตัวโปรแกรมที่สร้างจริง หน้าโหลดจากตัวโปรแกรม ไม่ใช่ dev server", origin === "http://tauri.localhost", origin);
}
await waitFor(`return document.querySelectorAll('.book').length >= ${hasLong ? 7 : 6}`, 60000);
await goCheck();

// ---------- 1 ก่อนตรวจ ----------
const names = await q("return [...document.querySelectorAll('[data-ckrow]')].map(r => r.dataset.ckrow)");
const count0 = await q("return document.querySelector('[data-ckcount]').innerText");
const quickOn = await q("return document.querySelector('.mode.on')?.innerText ?? ''");
await shot("01-ก่อนตรวจ.png", ".main");
check("หน้าตรวจไฟล์ ทุกเรื่องขึ้นตาราง เลือกไว้ทั้งหมด ตั้งต้นตรวจแบบเร็ว ผลเป็น ยังไม่เคยตรวจ",
  names.length === (hasLong ? 7 : 6) && count0.includes(`เลือกไว้ ${names.length} เรื่อง`) && quickOn.includes("ตรวจแบบเร็ว") && (await rowText("ดาวเหนือ (2023)")).includes("ยังไม่เคยตรวจ"),
  `${names.length} เรื่อง · ${count0} · ${quickOn.split("\n")[0]}`);

// เริ่มตรวจตอนไม่ได้เลือก · ปุ่มเป็นสีรอ ไม่เริ่ม
await selectOnly([]);
const waitBtn = await q("const b = document.querySelector('[data-ckstart]'); return [b.className, b.getAttribute('aria-disabled'), b.title]");
await c.evaluate("document.querySelector('[data-ckstart]').click()"); await sleep(400);
check("ไม่ได้เลือกเรื่อง ปุ่มเริ่มตรวจเป็นสีรอ บอกเหตุผลตอนชี้ กดแล้วไม่เริ่ม", waitBtn[0].includes("btn-wait") && waitBtn[1] === "true" && waitBtn[2].includes("เลือกเรื่อง") && !(await q("return !!document.querySelector('[data-ckstop]')")), waitBtn.join(" | "));

// ---------- 2 ตรวจแบบเร็วทุกเรื่อง (ไม่รวมวิดีโอยาว) ----------
const quickSet = names.filter((n) => n !== "วิดีโอยาว (2024)");
await clickText(".ckacts .btn", "เลือกเฉพาะที่ยังไม่เคยตรวจ"); await sleep(150);
const allUnchecked = await q("return document.querySelector('[data-ckcount]').innerText");
await selectOnly(quickSet);
await mode("quick");
await startCheck();
await idle();
await sleep(400);
const after = Object.fromEntries(await Promise.all(quickSet.map(async (n) => [n, await rowText(n)])));
const sum = await q("return document.querySelector('[data-cksum]')?.innerText.replace(/\\s+/g, ' ') ?? ''");
await shot("02-สรุปตรวจแบบเร็ว.png", ".main");
check("เลือกเฉพาะที่ยังไม่เคยตรวจ ได้ครบทุกเรื่อง", allUnchecked.includes(`เลือกไว้ ${names.length} เรื่อง`), allUnchecked);
check("ตรวจแบบเร็ว ไฟล์ดีสมบูรณ์ จดค่า hash · ไฟล์ขาดท้ายเสียหาย บอกว่าหายไปเท่าไหร่ · TS บอกว่าตรวจแบบเร็วบอกไม่ได้ว่าขาดท้าย",
  after["ดาวเหนือ (2023)"].includes("ไฟล์สมบูรณ์") && after["ดาวเหนือ (2023)"].includes("จดค่า hash")
  && after["ขาดท้าย (2022)"].includes("ไฟล์เสียหาย") && after["ขาดท้าย (2022)"].includes("หายไปราว")
  && after["บ้านริมคลอง (2017)"].includes("บอกไม่ได้ว่าขาดท้าย") && after["The Last Orchard (2022)"].includes("ไฟล์สมบูรณ์"),
  `ขาดท้าย: ${after["ขาดท้าย (2022)"]}`);
check("สรุปหลังตรวจครบ จำนวนตรง ตรวจกี่เรื่อง เสร็จเมื่อไหร่ ใช้เวลา มีปุ่มดูเฉพาะที่มีปัญหา ตรวจละเอียดเรื่องที่มีปัญหา",
  sum.includes(`${quickSet.length - 1} ไฟล์สมบูรณ์`) && sum.includes("1 ไฟล์เสียหาย") && sum.includes(`ตรวจ ${quickSet.length} เรื่องเสร็จ`) && sum.includes("ใช้เวลา") && sum.includes("ดูเฉพาะที่มีปัญหา") && sum.includes("ตรวจละเอียดเรื่องที่มีปัญหา"), sum);
// ดูเฉพาะที่มีปัญหา
await clickText("[data-cksum] .btn", "ดูเฉพาะที่มีปัญหา"); await sleep(250);
const onlyBad = await q("return [...document.querySelectorAll('[data-ckrow]')].map(r => r.dataset.ckrow)");
await clickText("[data-cksum] .btn", "ดูทุกเรื่อง"); await sleep(200);
check("ดูเฉพาะที่มีปัญหา เหลือแต่ไฟล์ขาดท้าย กดอีกทีกลับมาทุกเรื่อง", onlyBad.length === 1 && onlyBad[0] === "ขาดท้าย (2022)" && (await q("return document.querySelectorAll('[data-ckrow]').length")) === names.length, onlyBad.join(", "));
// คลังเขียนลงไฟล์แล้ว (เขียนรวมตอนจบชุด)
await sleep(500);
const saved = JSON.parse(readFileSync(LIB, "utf8")).movies.filter((m) => m.path.startsWith(DIR));
const sv = (n) => saved.find((m) => m.name === n);
check("ผลตรวจเขียนลงไฟล์คลังแล้ว สถานะ ผลตรวจ ค่า hash", sv("ดาวเหนือ (2023)")?.status === "ok" && /^[0-9a-f]{64}$/.test(sv("ดาวเหนือ (2023)")?.sha256 ?? "") && sv("ขาดท้าย (2022)")?.status === "bad" && sv("ขาดท้าย (2022)")?.check?.mode === "quick",
  `ดาวเหนือ ${sv("ดาวเหนือ (2023)")?.status} · ขาดท้าย ${sv("ขาดท้าย (2022)")?.status}`);
await closeToasts();

// ---------- 3 แก้ไฟล์ 1 ไบต์ ตรวจแบบเร็วต้องขึ้นไฟล์ถูกเปลี่ยน ----------
const one = join(DIR, "แก้หนึ่งไบต์ (2023).mkv");
{ const fd = openSync(one, "r+"); const b = Buffer.alloc(1); const pos = 8_000_000; readSync(fd, b, 0, 1, pos); b[0] ^= 0xff; writeSync(fd, b, 0, 1, pos); closeSync(fd); }
await selectOnly(["แก้หนึ่งไบต์ (2023)"]);
await startCheck(); await idle(); await sleep(300);
const changed = await rowText("แก้หนึ่งไบต์ (2023)");
await shot("03-ไฟล์ถูกเปลี่ยน.png", "[data-ckrow='แก้หนึ่งไบต์ (2023)']");
const savedHash = JSON.parse(readFileSync(LIB, "utf8")).movies.find((m) => m.name === "แก้หนึ่งไบต์ (2023)")?.sha256;
check("แก้ไฟล์ 1 ไบต์ ตรวจแบบเร็วขึ้นไฟล์ถูกเปลี่ยน คำตามต้นแบบ · ค่า hash ในคลังยังเป็นค่าเดิม", changed.includes("ไฟล์ถูกเปลี่ยน") && changed.includes("ค่า hash ไม่ตรงกับตอนตรวจครั้งก่อน") && savedHash === sv("แก้หนึ่งไบต์ (2023)")?.sha256, changed);
await closeToasts();

// ---------- 4 ตรวจละเอียด ไฟล์เสียกลางเรื่อง ----------
await selectOnly(["เสียกลางเรื่อง (2022)", "ขาดท้าย (2022)", "ดาวเหนือ (2023)"]);
await mode("full");
await startCheck(); await idle(); await sleep(400);
const broken = await rowText("เสียกลางเรื่อง (2022)");
const cut = await rowText("ขาดท้าย (2022)");
const good = await rowText("ดาวเหนือ (2023)");
check("ตรวจละเอียด ไฟล์ดีสมบูรณ์ ไม่พบที่เสีย", good.includes("ไฟล์สมบูรณ์") && good.includes("ตรวจละเอียด ไม่พบที่เสีย"), good);
check("ตรวจละเอียด ไฟล์ขาดท้ายจับได้ บอกว่าเล่นได้ถึงนาทีไหน จากความยาวเท่าไหร่", cut.includes("ไฟล์เสียหาย") && /ไฟล์ขาดท้าย เล่นได้ถึง 0:4\d จากความยาว 1:00/.test(cut), cut);
// หน้าต่างผลตรวจ
// คลิกเมาส์จริง · คลิกด้วยคำสั่ง ระบบถือว่าเป็นคีย์บอร์ด ปุ่มแรกในหน้าต่างขึ้นกรอบโฟกัสในภาพ ทั้งที่คลิกเมาส์จริงไม่ขึ้น
await c.click("[data-ckrow='เสียกลางเรื่อง (2022)'] td:nth-child(2)");
await waitFor("return !!document.querySelector('.dlg [data-ckspans]')", 5000);
const dlg = await q("return document.querySelector('.dlg').innerText.replace(/\\s+/g, ' ')");
const spanFrom = await q("const t = document.querySelector('.dlg [data-ckspans] tbody td').innerText; const [m, s] = t.split(/[–\\s]/)[0].split(':').map(Number); return m * 60 + s");
await shot("04-หน้าต่างผลตรวจ.png", ".dlg");
check("ตรวจละเอียด ไฟล์เสียกลางเรื่องจับได้ นาทีที่บอกห่างจากจุดที่ทำเสียไม่เกิน 5 วินาที · บอกว่าเสียที่ภาพหรือเสียง",
  broken.includes("ไฟล์เสียหาย") && Math.abs(spanFrom - truth["วินาทีเริ่ม"]) <= 5 && /ภาพ|เสียง/.test(dlg),
  `บอก ${spanFrom} วินาที จุดจริง ${truth["วินาทีเริ่ม"]}–${truth["วินาทีจบ"]} · ${broken}`);
check("หน้าต่างผลตรวจตามต้นแบบ หัว ผลตรวจ ชื่อไฟล์ · แบบตรวจ วันที่ ความยาว · ตาราง ช่วงเวลา เสียอะไร (คำ ภาพแตกเป็นสี่เหลี่ยม ตามต้นแบบ) · ต้นเหตุที่พบบ่อย · ปุ่มเปิดเล่นที่ ปิด",
  dlg.includes("ผลตรวจ เสียกลางเรื่อง (2022).mkv") && dlg.includes("ตรวจละเอียด") && dlg.includes("ความยาว 1 นาที") && dlg.includes("ช่วงเวลา") && dlg.includes("เสียอะไร") && /ภาพแตกเป็นสี่เหลี่ยม|เสียงเงียบหายไป/.test(dlg) && dlg.includes("ต้นเหตุที่พบบ่อย") && dlg.includes("เปิดเล่นที่ 0:30") && dlg.includes("ปิด"), dlg);

// ---------- 5 ปุ่มเปิดเล่นที่นาที ----------
// ไม่ได้ตั้งโปรแกรมเล่น และเครื่องนี้ไม่มีโปรแกรมที่เปิดตรงนาทีได้ · เปิดด้วยโปรแกรมหลักของ Windows แล้วบอกว่าเปิดตรงนาทีไม่ได้
// (เทสข้อนี้ไม่กดจริง เพราะจะเปิดโปรแกรมเล่นของ Windows ค้างบนจอพี่กัน · ข้อความดูได้จากโค้ด)
await inv("set_settings", { patch: { playerPath: join(FAKE, "vlc-fake.cmd") } });
await c.evaluate("document.querySelector('[data-ckplay]').click()");
let args = "";
for (let i = 0; i < 40 && !args; i++) { await sleep(150); if (existsSync(join(FAKE, "args.txt"))) args = readFileSync(join(FAKE, "args.txt"), "latin1"); }
const toastPlay = await q("return [...document.querySelectorAll('.toast')].map(t => t.innerText.replace(/\\s+/g, ' ')).join(' | ')");
await shot("05-เปิดเล่นที่นาที.png", ".app");
check("ปุ่มเปิดเล่นที่ 0:30 ส่งเวลาให้โปรแกรมเล่นตรงนาที (VLC --start-time=30) พร้อมไฟล์ · แถบบอกว่าเปิดด้วยโปรแกรมไหนที่นาทีไหน",
  args.includes("--start-time=30") && args.includes(".mkv") && toastPlay.includes("เปิดด้วย vlc-fake ที่ 0:30"), `${args.trim()} · ${toastPlay}`);
await inv("set_settings", { patch: { playerPath: "D:\\ไม่มีจริง\\vlc.exe" } });
await c.evaluate("document.querySelector('[data-ckplay]').click()"); await sleep(600);
const toastMissing = await q("return [...document.querySelectorAll('.toast')].map(t => t.innerText.replace(/\\s+/g, ' ')).join(' | ')");
// หาไม่เจอ พากลับไปหน้าตั้งค่าเหมือนปุ่มเปิดเล่นบนชั้นวาง (สเปกข้อ 9 · ผู้ช่วยตรวจสเปกข้อ 26) · หน้าต่างผลตรวจปิดเอง
const wentSettings = await q("return !!document.querySelector('[data-settingsscroll]') && !document.querySelector('.dlg')");
check("โปรแกรมเล่นที่ตั้งไว้หาไม่เจอ บอกให้ไปตั้งใหม่ที่หน้าตั้งค่า แล้วพาไปหน้าตั้งค่า", toastMissing.includes("หาโปรแกรมเล่นหนัง") && toastMissing.includes("หน้าตั้งค่า") && wentSettings, `${toastMissing} · ไปหน้าตั้งค่า ${wentSettings}`);
await inv("set_settings", { patch: { playerPath: "" } });
await c.evaluate("[...document.querySelectorAll('button.nav')].find(n => n.innerText.includes('ตรวจไฟล์')).click()"); await sleep(500);
await closeToasts();

// ---------- 6 กำลังตรวจ · หยุดทั้งชุด ----------
if (hasLong) {
  await selectOnly(["วิดีโอยาว (2024)", "The Last Orchard (2022)"]);
  await mode("full");
  await startCheck();
  await waitFor("return /กำลังตรวจ [1-9]/.test(document.querySelector(\"[data-ckrow='วิดีโอยาว (2024)']\")?.innerText ?? '')", 20000);
  await sleep(1200);
  const running = await rowText("วิดีโอยาว (2024)");
  const queued = await rowText("The Last Orchard (2022)");
  const lockedMode = await q("return document.querySelector('.mode')?.getAttribute('aria-disabled')");
  await shot("06-กำลังตรวจ.png", ".main");
  check("ระหว่างตรวจ แถวที่ตรวจอยู่บอก กำลังตรวจ เปอร์เซ็นต์ มีแถบความคืบหน้า · เรื่องถัดไปรอคิว · เลือกแบบตรวจไม่ได้ · มีปุ่มหยุดตรวจทั้งชุด",
    /กำลังตรวจ \d+%/.test(running) && queued.includes("รอคิว") && lockedMode === "true" && (await q("return !!document.querySelector(\"[data-ckrow='วิดีโอยาว (2024)'] .bar i\")")), `${running} · ${queued}`);
  const before = JSON.parse(readFileSync(LIB, "utf8")).movies.find((m) => m.name === "วิดีโอยาว (2024)");
  await c.evaluate("document.querySelector('[data-ckstop]').click()");
  await idle();
  await sleep(500);
  const stopped = await rowText("วิดีโอยาว (2024)");
  const toastStop = await q("return [...document.querySelectorAll('.toast')].map(t => t.innerText.replace(/\\s+/g, ' ')).join(' | ')");
  await shot("07-หยุดทั้งชุด.png", ".main");
  const afterLib = JSON.parse(readFileSync(LIB, "utf8")).movies.find((m) => m.name === "วิดีโอยาว (2024)");
  check("กดหยุดตรวจทั้งชุด หยุดจริง เรื่องที่ตรวจค้างไม่ถูกเขียนผล ขึ้นแถบบอกว่าตรวจไปกี่เรื่อง",
    stopped.includes("ยังไม่เคยตรวจ") && toastStop.includes("หยุดตรวจแล้ว") && afterLib?.status === before?.status && !afterLib?.check, `${stopped} · ${toastStop}`);
  const sumStop = await q("return document.querySelector('[data-cksum]')?.innerText.replace(/\\s+/g, ' ') ?? ''");
  check("สรุปตอนหยุดกลางทาง บอกว่าตรวจไปกี่เรื่อง แยกจากเวลาที่หยุด อ่านไม่ติดกัน", /ตรวจไป \d+ จาก 2 เรื่อง · หยุดเมื่อ \d/.test(sumStop), sumStop);
  await closeToasts();
}

// ---------- 7 เตือนตรวจซ้ำ ----------
const tlo = join(DIR, "The Last Orchard (2022).mp4");
const tloSha = JSON.parse(readFileSync(LIB, "utf8")).movies.find((m) => m.name === "The Last Orchard (2022)")?.sha256 ?? null;
await inv("dev_set_check", { path: tlo, status: "ok", sha256: tloSha, checkAt: Math.floor(Date.now() / 1000) - 40 * 86400 });
await sleep(400);
const due = await rowText("The Last Orchard (2022)");
await shot("08-ถึงเวลาตรวจซ้ำ.png", "[data-ckrow='The Last Orchard (2022)']");
check("ตรวจครั้งล่าสุดเกินจำนวนวันที่ตั้ง (30 วัน) ขึ้นว่าถึงเวลาตรวจซ้ำ", due.includes("ถึงเวลาตรวจซ้ำ"), due);

// ---------- 8 ป้ายสีบนชั้น · การ์ดสถานะสั่งตรวจได้ ----------
await clickText("button.nav", "ชั้นวางหนัง"); await sleep(600);
const badges = await q("return Object.fromEntries([...document.querySelectorAll('.book')].map(b => [b.dataset.movie, [...b.querySelectorAll('.badge')].map(x => x.className).join(' ')]))");
const sideCount = await q("return [...document.querySelectorAll('button.nav')].find(n => n.innerText.includes('ตรวจไฟล์'))?.querySelector('.count')?.innerText ?? ''");
await shot("09-ป้ายสีบนชั้น.png", ".main");
check("ป้ายสีบนชั้นเปลี่ยนตามผล เสียหายแดง ถูกเปลี่ยนเหลือง สมบูรณ์เขียว · เลขที่เมนูตรวจไฟล์ = เหลือง + แดง",
  /b-bad/.test(badges["เสียกลางเรื่อง (2022)"] ?? "") && /b-bad/.test(badges["ขาดท้าย (2022)"] ?? "") && /b-warn/.test(badges["แก้หนึ่งไบต์ (2023)"] ?? "") && /b-ok/.test(badges["ดาวเหนือ (2023)"] ?? ""),
  `${JSON.stringify(badges)} · เมนู ${sideCount}`);
// การ์ดสถานะไฟล์ถูกเปลี่ยน กดตรวจละเอียด ไปหน้าตรวจไฟล์แล้วเริ่มตรวจเรื่องนั้น
await c.book("แก้หนึ่งไบต์ (2023)"); await sleep(300);
const card = await q("return document.querySelector('.detail .stat')?.innerText.replace(/\\s+/g, ' ') ?? ''");
await shot("10-การ์ดสถานะถูกเปลี่ยน.png", ".detail");
await clickText(".detail .btn", "ตรวจละเอียด");
await waitFor("return !!document.querySelector('[data-check]')", 5000);
// รอการตรวจเริ่มก่อน แล้วค่อยรอจบ · เปลี่ยนหน้ามาแล้วการตรวจยังไม่ทันเริ่ม ปุ่มหยุดยังไม่ขึ้น ถ้ารอจบเลยจะอ่านผลกลางทาง (เจอตอนเทสตัวจริง 7 พ.ย. 2569)
await waitFor("return !!document.querySelector('[data-ckstop]')", 5000);
await idle(); await sleep(400);
const fromShelf = await rowText("แก้หนึ่งไบต์ (2023)");
check("การ์ดสถานะบนชั้น ไฟล์ถูกเปลี่ยน กดตรวจละเอียด พาไปหน้าตรวจไฟล์แล้วตรวจเรื่องนั้นเลย",
  card.includes("ไฟล์ถูกเปลี่ยนตั้งแต่ตรวจครั้งก่อน") && /ไฟล์สมบูรณ์|ไฟล์เสียหาย/.test(fromShelf) && !fromShelf.includes("ไฟล์ถูกเปลี่ยน"), `${card} → ${fromShelf}`);
await closeToasts();
// การ์ดสถานะเสียหาย ดูผลตรวจ เปิดหน้าต่างผลตรวจ
await clickText("button.nav", "ชั้นวางหนัง"); await sleep(500);
await c.book("เสียกลางเรื่อง (2022)"); await sleep(300);
await clickText(".detail .btn", "ดูผลตรวจ");
const opened = await waitFor("return document.querySelector('.dlg')?.innerText.includes('ผลตรวจ เสียกลางเรื่อง') ?? false", 5000);
check("การ์ดสถานะเสียหาย กดดูผลตรวจ เปิดหน้าต่างผลตรวจของเรื่องนั้น", opened);
await c.evaluate("[...document.querySelectorAll('.dlg .btn')].find(b => b.innerText === 'ปิด')?.click()"); await sleep(200);

if (BUILT) {
  const csp = await q("return window.__csp ?? null");
  check("ตัวโปรแกรมที่สร้างจริง ไม่มีอะไรโดนกติกาความปลอดภัยกันตลอดการเทส ทั้งการตรวจ แถบความคืบหน้า และปุ่มเปิดเล่น", Array.isArray(csp) && csp.length === 0, JSON.stringify(csp));
}
const pass = results.filter((r) => r.pass).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 1));
await c.close?.();
process.exit(pass === results.length ? 0 : 1);
