// ตัวตรวจระบบจับคู่รูปปก (แผนจับคู่รูปปก · มอคอัป docs/mockups/poster-link.html)
// ลอกชุดทดสอบไปไว้ D:\dev\tmp\ชั้นจับคู่ ไม่แตะของจริง · ยืนยันจริง เขียนไฟล์จริงในโฟลเดอร์นั้น เช็กด้วยไฟล์บนดิสก์
// ไม่กดปุ่มเลือกไฟล์เลือกโฟลเดอร์ (หน้าต่างเลือกไฟล์จะเด้งขึ้นจอ) · ลากจาก Explorer จำลองด้วย window.__linkDrop ลากจริงพี่กันต้องลองเอง
// ใช้: node scripts/check-link.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const SRC = join("test-media", "สร้าง", "จับคู่");
const OUT = "docs/report-2026-11-08/จับคู่ปก";
const DIR = "D:\\dev\\tmp\\ชั้นจับคู่";
const MOV = join(DIR, "หนัง"), IMG = join(DIR, "รูป"), DL = join(DIR, "รูปดาวน์โหลด");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const hashes = (d) => Object.fromEntries(readdirSync(d, { recursive: true, withFileTypes: true }).filter((e) => e.isFile()).map((e) => { const p = join(e.parentPath ?? e.path, e.name); return [p, sha(p)]; }));

const c = await connect();
// เอาโฟลเดอร์ทดสอบออกจากคลังก่อนลบ · คลังจำหนังตามที่อยู่ไฟล์ด้วย ไม่งั้นปกจับคู่ของรอบก่อนติดมา
const scanOut = async () => {
  await c.evaluate(`window.__TAURI_INTERNALS__.invoke("set_settings", { patch: { folders: [] } })`);
  await c.evaluate(`window.__TAURI_INTERNALS__.invoke("scan_library")`);
  for (let i = 0; i < 100; i++) {
    const l = await c.evaluate(`window.__TAURI_INTERNALS__.invoke("get_library")`);
    if (!l.scanning && l.movies.every((m) => !m.path.startsWith(MOV))) break;
    await sleep(200);
  }
};
await scanOut();
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
mkdirSync(OUT, { recursive: true });
cpSync(SRC, DIR, { recursive: true });
const movieHash0 = Object.fromEntries(Object.entries(hashes(MOV)).filter(([p]) => /\.(mkv|mp4)$/i.test(p)));
const imgHash0 = hashes(IMG);

const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass }); console.log(`${pass ? "✅" : "❌"} ${name}${detail !== "" ? " · " + detail : ""}`); };
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const waitFor = async (js, ms = 30000) => { for (let t = 0; t < ms; t += 150) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(150); } return false; };
const shot = async (f, sel, h = 1000) => {
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(350);
  await c.move(5, h - 5);
  await sleep(250);
  const r = await c.shot(`${OUT}/${f}`, sel, 4);
  await c.send("Emulation.clearDeviceMetricsOverride");
  await sleep(150);
  return r;
};
const nav = (label) => c.evaluate(`[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes(${JSON.stringify(label)})).click()`);
const drop = (paths, x = 400, y = 300) => c.evaluate(`window.__linkDrop(${JSON.stringify(paths)}, ${x}, ${y})`);
const rowSel = (title) => `[...document.querySelectorAll('[data-link-row]')].find(r => r.querySelector('.lname b')?.textContent === ${JSON.stringify(title)})`;
const statusOf = (title) => q(`return ${rowSel(title)}?.dataset.linkStatus ?? null`);
const reasonOf = (title) => q(`return ${rowSel(title)}?.querySelector('[data-link-reason]')?.textContent ?? null`);
const clickIn = (title, sel) => c.evaluate(`${rowSel(title)}.querySelector(${JSON.stringify(sel)}).click()`);
const dropOnRow = async (title, paths) => {
  const b = await q(`const r = ${rowSel(title)}; r.scrollIntoView({ block: 'center' }); const b = r.getBoundingClientRect(); return { x: (b.left + 200) * devicePixelRatio, y: (b.top + b.height / 2) * devicePixelRatio };`);
  await sleep(150);
  await drop(paths, b.x, b.y);
};
const stateNow = () => inv("link_state");
const bodyHas = (t) => q(`return document.body.innerText.includes(${JSON.stringify(t)})`);

/* ---------- เตรียม ---------- */
await inv("set_settings", { patch: { folders: [MOV], linkStore: "beside", posterFormat: "jpg", jpgQuality: 90 } });
await inv("scan_library");
await waitFor("return true", 500);
for (let i = 0; i < 200; i++) {
  const l = await inv("get_library");
  if (!l.scanning && l.movies.filter((m) => m.path.startsWith(MOV)).length === 14) break;
  await sleep(300);
}
const lib0 = await inv("get_library");
check("อ่านชุดทดสอบขึ้นคลัง 14 เรื่อง", lib0.movies.filter((m) => m.path.startsWith(MOV)).length === 14);
// ล้างของค้างจากรอบก่อน
const st0 = await stateNow();
for (const r of st0.rows) await inv("link_row_update", { id: r.id, patch: { skip: true } });
for (const f of [...st0.imageFolders, ...st0.loose]) await inv("link_remove_images", { path: f });
await c.evaluate("location.reload()");
await waitFor("return !!document.querySelector('.side .nav')");
await sleep(600);

/* ---------- หน้า 1 ลากโฟลเดอร์ ---------- */
await nav("จับคู่ปก");
await waitFor("return !!document.querySelector('[data-link-page]')");
check("เมนูซ้ายมีหน้าจับคู่ปก ต่อจากใส่โปสเตอร์", await q("const n = [...document.querySelectorAll('.side .nav')].map(b => b.innerText); return n.findIndex(t => t.includes('จับคู่ปก')) === n.findIndex(t => t.includes('ใส่โปสเตอร์')) + 1"));
await drop([IMG]);
await waitFor("return !!document.querySelector('[data-link-summary]')");
const sum = await q("return document.querySelector('[data-link-summary]').innerText");
check("อ่านรูป 15 รูป จับคู่ได้แน่ 9 ไม่แน่ใจ 2 หาคู่ไม่เจอ 2", /15 รูป/.test(sum) && /ได้แน่ 9/.test(sum) && /ไม่แน่ใจ 2/.test(sum) && /ไม่เจอ 2/.test(sum), sum.replace(/\n/g, " "));
check("โฟลเดอร์ที่เลือกขึ้นรายการ", await q(`return !!document.querySelector('[data-link-folder]')`));
check("ยังไม่มีไฟล์ใหม่ข้างหนัง ก่อนยืนยัน", !existsSync(join(MOV, "ดาวเหนือ.2023.1080p.BluRay.x265-poster.jpg")));
await shot("1-ลากโฟลเดอร์.png", "[data-link-page]");

/* ---------- หน้า 2 ตาราง ---------- */
await c.evaluate("document.querySelector('[data-link-open]').click()");
await waitFor("return !!document.querySelector('[data-link-table]')");
const tabs = await q("return Object.fromEntries([...document.querySelectorAll('[data-link-tab]')].map(b => [b.dataset.linkTab, b.innerText]))");
check("แท็บนับถูก ทั้งหมด 13 แน่ 9 ไม่แน่ใจ 2 ไม่เจอ 2", /13/.test(tabs.all) && /9/.test(tabs.sure) && /2/.test(tabs.unsure) && /2/.test(tabs.none), JSON.stringify(tabs));
check("เหตุผล ชื่อกับปีตรง", (await reasonOf("ดาวเหนือ (2023)")) === "ชื่อกับปีตรง");
check("เหตุผล รูปอยู่ข้างไฟล์หนัง", (await reasonOf("ฝนสุดท้ายของฤดู (2019)")) === "รูปอยู่ข้างไฟล์หนัง");
check("เหตุผล เลข IMDb", (await reasonOf("Night Bus (2020)")) === "เลข IMDb ตรงกัน");
check("แถวไม่แน่ใจมีรูปใกล้เคียง 3 รูป ชื่อคล้าย 82%", await q(`const r = ${rowSel("เมืองในหมอก (2015)")}; return r.querySelectorAll('[data-link-cand]').length === 3 && r.querySelector('[data-link-reason]').textContent.includes('82%')`));
check("รูปแนวนอนบอกว่าครอปเป็นปกตั้งให้แล้ว", await q(`return ${rowSel("Silent Orbit (2018)")}.textContent.includes('ครอปเป็นปกตั้งให้แล้ว')`));
await c.evaluate(`${rowSel("ดาวเหนือ (2023)")}.scrollIntoView({ block: 'center' })`);
await waitFor(`return ${rowSel("ดาวเหนือ (2023)")}.querySelector('[data-link-chosen] img')?.naturalWidth > 0`, 20000);
check("ภาพเล็กของรูปขึ้นในแถว", await q(`return ${rowSel("ดาวเหนือ (2023)")}.querySelector('[data-link-chosen] img')?.naturalWidth > 0`));
await c.evaluate(`${rowSel("ฝนสุดท้ายของฤดู (2019)")}.scrollIntoView({ block: 'center' })`);
await waitFor(`return ${rowSel("ฝนสุดท้ายของฤดู (2019)")}.querySelector('[data-link-chosen] img')?.naturalWidth > 0`, 20000);
check("ภาพเล็กของรูปข้างไฟล์หนังขึ้นด้วย", await q(`return ${rowSel("ฝนสุดท้ายของฤดู (2019)")}.querySelector('[data-link-chosen] img')?.naturalWidth > 0`));
const countText = () => q("return document.querySelector('[data-link-count]')?.innerText ?? ''");
check("ท้ายตาราง รอยืนยัน 9 ติ๊กไว้ 9", /รอยืนยัน 9 คู่ ติ๊กไว้ 9 คู่/.test(await countText()), await countText());
check("ปุ่มยืนยันทั้งหมดบอกจำนวน", await q("return document.querySelector('[data-link-confirm-all]').innerText === 'ยืนยันทั้งหมด 9 คู่'"));
check("เมนูซ้ายขึ้นเลขคู่ที่รอ", await q("return [...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('จับคู่ปก')).innerText.includes('9')"));

// ติ๊กออก
await clickIn("Tidal (2021)", "[data-link-tick]");
await waitFor(`return /ติ๊กไว้ 8 คู่/.test(document.querySelector('[data-link-count]')?.innerText)`);
check("เอาติ๊กออก ที่ติ๊กไว้เหลือ 8 ทั้งหมดยังนับ 9", /รอยืนยัน 9 คู่ ติ๊กไว้ 8 คู่/.test(await countText()));
check("สองปุ่มนับต่างกัน", await q("return document.querySelector('[data-link-confirm-ticked]').innerText.includes('8') && document.querySelector('[data-link-confirm-all]').innerText.includes('9')"));

// แถวไม่แน่ใจ กดเลือกรูป
await c.evaluate(`${rowSel("เมืองในหมอก (2015)")}.querySelector('[data-link-cand="เมืองหมอก.jpg"]').click()`);
await waitFor(`return !!${rowSel("เมืองในหมอก (2015)")}.querySelector('[data-link-chosen]')`);
check("กดรูปใกล้เคียงแล้วถูกเลือกและติ๊ก", await q(`const r = ${rowSel("เมืองในหมอก (2015)")}; return r.querySelector('[data-link-tick]').getAttribute('aria-checked') === 'true' && r.querySelector('[data-link-confirm]').textContent === 'ยืนยันรูปที่เลือก' && r.querySelector('.lcand.sel') !== null`));
check("รอยืนยันเพิ่มเป็น 10 แถวไม่แน่ใจที่ยังไม่เลือกไม่นับ", /รอยืนยัน 10 คู่/.test(await countText()), await countText());

// ลากรูปจาก Explorer ลงแถว · หลายรูปแยกแนว · ไฟล์ที่ไม่ใช่รูปไม่รับ
await dropOnRow("Paper Kites (2012)", [join(DL, "ไม่ใช่รูป.txt")]);
await waitFor("return document.body.innerText.includes('ไม่ใช่รูป')");
check("ไฟล์ที่ไม่ใช่รูปไม่รับ", (await statusOf("Paper Kites (2012)")) === "none" && await bodyHas("ไม่ใช่รูป"));
await c.evaluate("document.querySelectorAll('.toasts .x').forEach(b => b.click())");
await dropOnRow("Copper Sky (2014)", [join(DL, "copper-wide.jpg"), join(DL, "copper-tall.jpg")]);
await waitFor(`return ${rowSel("Copper Sky (2014)")}?.dataset.linkStatus === 'manual'`);
const copper = (await stateNow()).rows.find((r) => r.title === "Copper Sky (2014)");
check("ลากสองรูปลงแถวเดียว แนวตั้งเป็นปกตั้ง แนวนอนเป็นปกนอน", copper?.tall?.name === "copper-tall.jpg" && copper?.wide?.name === "copper-wide.jpg" && !copper.derivedTall);
check("เหตุที่จับคู่บอก ลากจาก Explorer", (await reasonOf("Copper Sky (2014)")) === "ลากจาก Explorer");
await clickIn("Copper Sky (2014)", "[data-link-undo]");
await waitFor(`return ${rowSel("Copper Sky (2014)")}?.dataset.linkStatus === 'none'`);
check("กดย้อนกลับเป็นหาคู่ไม่เจอ", (await statusOf("Copper Sky (2014)")) === "none");
await dropOnRow("Copper Sky (2014)", [join(DL, "copper-wide.jpg"), join(DL, "copper-tall.jpg")]);
await waitFor(`return ${rowSel("Copper Sky (2014)")}?.dataset.linkStatus === 'manual'`);

// กรองแท็บ ค้นหา
await c.evaluate("document.querySelector('[data-link-tab=\"manual\"]').click()");
await sleep(200);
check("แท็บจับคู่เอง เหลือแถวเดียว", await q("return document.querySelectorAll('[data-link-row]').length === 1"));
await c.evaluate("document.querySelector('[data-link-tab=\"all\"]').click()");
await sleep(150);
await shot("2-ตารางตรวจผล.png", "[data-link-table]", 1100);

/* ---------- ยืนยันทีละเรื่อง ---------- */
const moviePoster = (stem) => join(MOV, `${stem}-poster.jpg`);
await clickIn("ดาวเหนือ (2023)", "[data-link-confirm]");
await waitFor(`return ${rowSel("ดาวเหนือ (2023)")}?.dataset.linkStatus === 'saved'`);
const dao = moviePoster("ดาวเหนือ.2023.1080p.BluRay.x265");
check("ยืนยันเรื่องเดียว ได้ไฟล์ -poster ข้างหนัง", existsSync(dao));
const m1 = (await inv("get_library")).movies.find((m) => m.path.includes("ดาวเหนือ.2023"));
check("คลังจดปกจับคู่ ที่เก็บ beside เป็นของโปรแกรม", m1?.linked?.length === 1 && m1.linked[0].store === "beside" && m1.linked[0].owned && m1.linked[0].orient === "tall");
check("แถวขึ้นบันทึกแล้วกับปุ่มยกเลิก", await q(`const r = ${rowSel("ดาวเหนือ (2023)")}; return r.textContent.includes('บันทึกแล้ว') && !!r.querySelector('[data-link-unsave]')`));
await clickIn("ดาวเหนือ (2023)", "[data-link-unsave]");
await waitFor(`return ${rowSel("ดาวเหนือ (2023)")}?.dataset.linkStatus === 'sure'`);
check("ยกเลิก ไฟล์ลงถังขยะ แถวกลับไปรอ", !existsSync(dao) && (await statusOf("ดาวเหนือ (2023)")) === "sure");
check("ยกเลิกแล้วคลังไม่เหลือปกจับคู่", ((await inv("get_library")).movies.find((m) => m.path.includes("ดาวเหนือ.2023")).linked ?? []).length === 0);

/* ---------- ชื่อชน ---------- */
const harbor = moviePoster("Harbor.Lights.2021.2160p.WEB-DL");
writeFileSync(harbor, "ไฟล์ของคนอื่น");
const harborSha = sha(harbor);
await clickIn("Harbor Lights (2021)", "[data-link-confirm]");
await waitFor(`return !!${rowSel("Harbor Lights (2021)")}?.querySelector('[data-link-error]')`);
check("ชื่อชน ไม่เขียนทับ แถวบอกเหตุผล", sha(harbor) === harborSha && (await q(`return ${rowSel("Harbor Lights (2021)")}.querySelector('[data-link-error]').textContent.includes('ไม่เขียนทับ')`)));
await shot("3-ชื่อชน.png", `[data-link-row="${(await stateNow()).rows.find((r) => r.title === "Harbor Lights (2021)").id.replace(/["\\]/g, "\\$&")}"]`);
await clickIn("Harbor Lights (2021)", "[data-link-toapp]");
await waitFor(`return !${rowSel("Harbor Lights (2021)")}?.querySelector('[data-link-error]')`);
await clickIn("Harbor Lights (2021)", "[data-link-confirm]");
await waitFor(`return ${rowSel("Harbor Lights (2021)")}?.dataset.linkStatus === 'saved'`);
const hm = (await inv("get_library")).movies.find((m) => m.path.includes("Harbor.Lights"));
check("กดเก็บในโปรแกรมแทน สำเร็จ ไฟล์คนอื่นยังเหมือนเดิม", hm.linked[0].store === "app" && existsSync(hm.linked[0].file) && sha(harbor) === harborSha);

/* ---------- ยืนยันทั้งหมด ---------- */
await c.evaluate("document.querySelector('[data-link-confirm-all]').click()");
await waitFor("return !document.querySelector('[data-link-progress]') && /รอยืนยัน 0 คู่/.test(document.querySelector('[data-link-count]')?.innerText)", 60000);
const st = await stateNow();
const by = (s) => st.rows.filter((r) => r.status === s).map((r) => r.title);
check("ยืนยันทั้งหมด แถวที่มีรูปบันทึกหมด เหลือแถวไม่แน่ใจกับหาไม่เจอ", by("unsure").join() === "Iron Tide (2010)" && by("none").join() === "Paper Kites (2012)", JSON.stringify({ saved: by("saved").length, unsure: by("unsure"), none: by("none") }));
check("ที่ติ๊กออกก็ถูกยืนยัน เพราะกดยืนยันทั้งหมด", by("saved").includes("Tidal (2021)"));
check("ได้ไฟล์ -poster ข้างหนังหลายเรื่อง", ["ดาวเหนือ.2023.1080p.BluRay.x265", "Iron Tide (2024)", "Tidal.2021.1080p", "Night.Bus.2020"].every((s) => existsSync(moviePoster(s))));
check("รูปแนวนอน ได้ทั้ง -poster และ -landscape", existsSync(moviePoster("Silent.Orbit.2018")) && existsSync(join(MOV, "Silent.Orbit.2018-landscape.jpg")));
check("ลากสองรูป ได้ทั้ง -poster และ -landscape", existsSync(moviePoster("Copper.Sky.2014")) && existsSync(join(MOV, "Copper.Sky.2014-landscape.jpg")));
check("รูปข้างหนังชื่อถูกอยู่แล้ว ไม่คัดลอกซ้ำ", !existsSync(join(MOV, "Ember (2022)-poster (2).jpg")) && sha(join(MOV, "Ember (2022)-poster.jpg")) === sha(join(SRC, "หนัง", "Ember (2022)-poster.jpg")));
const em = (await inv("get_library")).movies.find((m) => m.path.includes("Ember (2022)"));
check("รูปข้างหนังชื่อถูก ไม่นับเป็นของโปรแกรม", em.linked[0].owned === false);
const movieNow = Object.fromEntries(Object.keys(movieHash0).map((p) => [p, sha(p)]));
check("ไฟล์หนังทุกเรื่องเท่าเดิมทุกไบต์", JSON.stringify(movieNow) === JSON.stringify(movieHash0));
check("รูปต้นฉบับทุกรูปเท่าเดิมทุกไบต์", JSON.stringify(hashes(IMG)) === JSON.stringify(imgHash0));
check("ไม่มีไฟล์ชั่วคราวค้างข้างหนัง", !readdirSync(MOV).some((n) => /partial|\.old$/.test(n)));
check("เมนูซ้ายไม่มีเลขรอแล้ว", await q("return /^\\s*จับคู่ปก\\s*$/.test([...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('จับคู่ปก')).innerText)"));
await shot("4-ยืนยันแล้ว.png", "[data-link-table]", 1100);

/* ---------- ปิดเปิดหน้าใหม่ แถวที่รอยังอยู่ ---------- */
await inv("link_pair", { id: st.rows.find((r) => r.title === "Paper Kites (2012)").id, paths: [join(IMG, "tidal_alt.jpg")], via: "board" });
await c.evaluate("location.reload()");
await waitFor("return !!document.querySelector('.side .nav')");
await sleep(500);
await nav("จับคู่ปก");
await waitFor("return !!document.querySelector('[data-link-table]')");
check("เปิดหน้าใหม่ เจอตารางเลย คู่ที่รอยังอยู่", (await statusOf("Paper Kites (2012)")) === "manual");
check("เปิดหน้าใหม่ แถวรูปข้างไฟล์หนังยังมีภาพเล็ก", (await stateNow()).rows.find((r) => r.title === "ฝนสุดท้ายของฤดู (2019)")?.tall?.thumb);
// หน้าต่างเล็กสุดของโปรแกรม ปุ่มต้องไม่ตกขอบ
await c.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 640, deviceScaleFactor: 1, mobile: false });
await sleep(400);
const clipped = await q("const box = document.querySelector('[data-link-rows]').getBoundingClientRect(); return [...document.querySelectorAll('[data-link-row]')].slice(0, 6).flatMap(r => [...r.querySelectorAll('button')]).filter(b => b.getBoundingClientRect().right > box.right + 0.5).length");
check("หน้าต่างเล็กสุด 1024 ปุ่มในแถวไม่ตกขอบ", clipped === 0, clipped);
await c.send("Emulation.clearDeviceMetricsOverride");

const pass = results.filter((r) => r.pass).length;
console.log(`\nผ่าน ${pass} จาก ${results.length} ข้อ`);
c.close();
if (pass !== results.length) process.exitCode = 1;
void statSync;
