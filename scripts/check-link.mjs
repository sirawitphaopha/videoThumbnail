// ตัวตรวจระบบจับคู่รูปปก (แผนจับคู่รูปปก · มอคอัป docs/mockups/poster-link.html)
// ลอกชุดทดสอบไปไว้ D:\dev\tmp\ชั้นจับคู่ ไม่แตะของจริง · ยืนยันจริง เขียนไฟล์จริงในโฟลเดอร์นั้น เช็กด้วยไฟล์บนดิสก์
// ไม่กดปุ่มเลือกไฟล์เลือกโฟลเดอร์ (หน้าต่างเลือกไฟล์จะเด้งขึ้นจอ) · ลากจาก Explorer จำลองด้วย window.__linkDrop ลากจริงพี่กันต้องลองเอง
// ใช้: node scripts/check-link.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join } from "node:path";
import { spawnSync } from "node:child_process";
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

/* ---------- ขั้น 4 กระดาน ---------- */
const stPK = (await stateNow()).rows.find((r) => r.title === "Paper Kites (2012)");
await inv("link_undo", { id: stPK.id });
await c.evaluate("location.reload()");
await waitFor("return !!document.querySelector('.side .nav')");
await sleep(500);
await nav("จับคู่ปก");
await waitFor("return !!document.querySelector('[data-link-goboard]')");
await c.evaluate("document.querySelector('[data-link-goboard]').click()");
await waitFor("return !!document.querySelector('[data-link-board]')");
await waitFor(`return !!document.querySelector('[data-board-title="Paper Kites (2012)"]') && document.querySelectorAll('[data-board-img]').length > 0`);
const titlesOnBoard =() => q("return [...document.querySelectorAll('[data-board-movie]')].map(m => m.dataset.boardTitle)");
const MT = (t) => `document.querySelector(${JSON.stringify(`[data-board-title="${t}"]`)})`;
const IM = (n) => `document.querySelector(${JSON.stringify(`[data-board-img="${n}"]`)})`;
check("กระดานขึ้นเฉพาะเรื่องที่ยังไม่มีปกและไม่มีคู่รอ", JSON.stringify((await titlesOnBoard()).sort()) === JSON.stringify(["Iron Tide (2010)", "Paper Kites (2012)"]), JSON.stringify(await titlesOnBoard()));
check("แถวหนังบอกโฟลเดอร์ของไฟล์", await q(`return document.querySelector('[data-board-movie] .fn').textContent.includes(${JSON.stringify(MOV)})`));
check("หัวแผงรูปขึ้นโฟลเดอร์ พร้อมจำนวน", await q(`const t = document.querySelector('[data-board-img-folders] .pathline').textContent; return t.includes(${JSON.stringify(IMG)}) && t.includes('15 รูป')`));
check("หัวแผงหนังขึ้นโฟลเดอร์ พร้อมจำนวน", await q(`const t = document.querySelector('[data-board-mv-folders] .pathline').textContent; return t.includes(${JSON.stringify(MOV)}) && t.includes('14 เรื่อง')`));
const pane = (name) => q(`const b = document.querySelector('[data-board-pane="${name}"]').getBoundingClientRect(); return { x: (b.left + 40) * devicePixelRatio, y: (b.top + 12) * devicePixelRatio };`);
const movieBox = (title) => q(`const m = ${MT(title)}; m.scrollIntoView({ block: 'nearest' }); const b = m.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };`);
const boardDrop = (paths, p) => c.evaluate(`window.__boardDrop(${JSON.stringify(paths)}, ${p.x}, ${p.y})`);
const boardHover = (paths, p) => c.evaluate(`window.__boardHover(${p.x}, ${p.y}, ${JSON.stringify(paths)})`);
const rowNow = async (title) => (await stateNow()).rows.find((r) => r.title === title);
const sentOf = (title) => `return ${MT(title)}?.classList.contains('sent')`;
const notSent = (title) => `return !${MT(title)}?.classList.contains('sent')`;

// เพิ่มโฟลเดอร์รูปที่สอง · แถวยาวลงมา · ไฟล์ที่ไม่ใช่รูปไม่ขึ้น
const imgBefore = await q("return document.querySelectorAll('[data-board-img]').length");
await boardDrop([DL], await pane("images"));
await waitFor("return document.querySelectorAll('[data-board-img-folders] .pathline').length === 2");
await waitFor(`return document.querySelectorAll('[data-board-img]').length === ${imgBefore + 1}`);
// โฟลเดอร์นี้มี 3 รูป · copper-tall กับ copper-wide ถูกใช้กับ Copper Sky ไปแล้ว เหลือบนกระดานรูปเดียว
check("เพิ่มโฟลเดอร์รูปที่สอง แถวโฟลเดอร์เป็น 2 รูปที่ยังไม่ใช้เพิ่ม 1 ไม่นับไฟล์ที่ไม่ใช่รูป", await q(`return document.querySelectorAll('[data-board-img]').length === ${imgBefore + 1} && !!${IM("ember-poster-hd.jpg")} && ![...document.querySelectorAll('[data-board-img]')].some(i => i.dataset.boardImg.endsWith('.txt'))`));
check("หัวแผงนับรูปของโฟลเดอร์ที่สองครบ 3 รูป", await q(`return document.querySelectorAll('[data-board-img-folders] .pathline')[1].textContent.includes('3 รูป')`));

// กดรูปแล้วกดหนัง
await c.evaluate(`${IM("IMG_2031.jpg")}.click()`);
await waitFor(`return ${IM("IMG_2031.jpg")}.classList.contains('sel')`);
check("กดรูป ขึ้นกรอบชมพู หนังบอกกดเพื่อใช้รูปที่เลือก", await q("return document.querySelector('[data-board-movie] .mvhint')?.textContent === 'กดเพื่อใช้รูปที่เลือก'"));
await c.evaluate(`${MT("Paper Kites (2012)")}.click()`);
await waitFor(sentOf("Paper Kites (2012)"));
const pk1 = await rowNow("Paper Kites (2012)");
check("กดรูปแล้วกดหนัง 2 คลิก คู่ไปรอที่ตาราง ยังไม่บันทึก", pk1?.status === "manual" && pk1?.tall?.name === "IMG_2031.jpg" && pk1?.reason === "จับคู่เองบนกระดาน" && !existsSync(moviePoster("Paper.Kites.2012")));
check("แถวสีฟ้าบอกส่งไปรอยืนยัน มีปุ่มย้อน", await q(`const m = ${MT("Paper Kites (2012)")}; return m.textContent.includes('ส่งไปรอยืนยันที่ตารางแล้ว') && !!m.querySelector('[data-board-undo]')`));
await waitFor(`return !${IM("IMG_2031.jpg")}`);
check("รูปที่ใช้แล้วหายจากแผงรูป", await q(`return !${IM("IMG_2031.jpg")}`));
await c.evaluate(`${MT("Paper Kites (2012)")}.querySelector('[data-board-undo]').click()`);
await waitFor(`return !!${IM("IMG_2031.jpg")}`);
check("กดย้อน รูปกลับมาที่แผงรูป แถวไม่มีรูป", !(await rowNow("Paper Kites (2012)"))?.tall);

// ลากรูปไปวางบนหนังในโปรแกรม
const imgBox = await q(`const m = ${IM("IMG_2031.jpg")}; m.scrollIntoView({ block: 'center' }); const b = m.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };`);
await sleep(150);
const target = await movieBox("Paper Kites (2012)");
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: imgBox.x, y: imgBox.y });
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: imgBox.x, y: imgBox.y, button: "left", clickCount: 1, buttons: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: imgBox.x + 30, y: imgBox.y + 10, buttons: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: target.x, y: target.y, buttons: 1 });
await sleep(250);
check("ระหว่างลาก มีรูปตามเมาส์ ช่องหนังขึ้นปล่อยเมาส์", await q(`return !!document.querySelector('[data-board-ghost]') && ${MT("Paper Kites (2012)")}.textContent.includes('ปล่อยเมาส์เพื่อใช้รูปนี้')`));
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 });
await waitFor(sentOf("Paper Kites (2012)"));
check("ลากรูปไปวางบนหนังได้", (await rowNow("Paper Kites (2012)"))?.tall?.name === "IMG_2031.jpg");
await shot("5-กระดาน.png", "[data-link-board]", 900);
await c.evaluate(`${MT("Paper Kites (2012)")}.querySelector('[data-board-undo]').click()`);
await waitFor(`return !!${IM("IMG_2031.jpg")}`);

// ลากจาก Explorer มาวางบนหนัง
const pos = async (title) => { const b = await movieBox(title); const k = await q("return devicePixelRatio"); return { x: b.x * k, y: b.y * k }; };
await boardHover([join(DL, "ember-poster-hd.jpg")], await pos("Iron Tide (2010)"));
await sleep(150);
check("ลากจาก Explorer มาชี้บนหนัง ขึ้นปล่อยเมาส์พร้อมชื่อรูป", await q(`const m = ${MT("Iron Tide (2010)")}; return m.classList.contains('target') && m.textContent.includes('ember-poster-hd.jpg')`));
await shot("7-ลากจาก-Explorer.png", "[data-link-board]", 900);
await boardHover([join(DL, "ไม่ใช่รูป.txt")], await pos("Iron Tide (2010)"));
await sleep(150);
check("ไฟล์ที่ไม่ใช่รูป ช่องขึ้นแดงว่าไม่รับ", await q(`const m = ${MT("Iron Tide (2010)")}; return m.classList.contains('bad') && m.textContent.includes('ไม่ใช่รูป ไม่รับ')`));
await boardDrop([join(DL, "ไม่ใช่รูป.txt")], await pos("Iron Tide (2010)"));
await waitFor("return document.querySelectorAll('.toasts .x').length > 0");
check("ปล่อยไฟล์ที่ไม่ใช่รูป ไม่รับ แถวไม่เปลี่ยน", !(await rowNow("Iron Tide (2010)"))?.tall);
await c.evaluate("document.querySelectorAll('.toasts .x').forEach(b => b.click())");
await boardDrop([join(DL, "ember-poster-hd.jpg")], await pos("Iron Tide (2010)"));
await waitFor(sentOf("Iron Tide (2010)"));
const it = await rowNow("Iron Tide (2010)");
check("วางจาก Explorer บนหนัง ไม่ต้องเอาเข้ากระดานก่อน เหตุที่จับคู่บอกทางมา", it?.tall?.name === "ember-poster-hd.jpg" && it?.reason === "ลากจาก Explorer" && it?.status === "manual");
await c.evaluate(`${MT("Iron Tide (2010)")}.querySelector('[data-board-undo]').click()`);
await waitFor(notSent("Iron Tide (2010)"));
await boardDrop([join(DL, "copper-wide.jpg"), join(DL, "copper-tall.jpg")], await pos("Paper Kites (2012)"));
await waitFor(sentOf("Paper Kites (2012)"));
const pk2 = await rowNow("Paper Kites (2012)");
check("ลากหลายรูปบนหนังเรื่องเดียว แนวตั้งเป็นปกตั้ง แนวนอนเป็นปกนอน", pk2?.tall?.name === "copper-tall.jpg" && pk2?.wide?.name === "copper-wide.jpg");

// คีย์บอร์ด Ctrl+Z
await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
await waitFor(notSent("Paper Kites (2012)"));
check("Ctrl+Z ย้อนคู่ล่าสุด", !(await rowNow("Paper Kites (2012)"))?.tall);
// คีย์บอร์ด ลูกศร
await c.evaluate("document.querySelector('[data-board-img]').focus()");
const firstName = await q("return document.activeElement.dataset.boardImg");
await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
await sleep(100);
check("ลูกศรเลื่อนไปรูปถัดไป", (await q("return document.activeElement.dataset.boardImg")) !== firstName);

// สลับมุมมอง
const seg = (p, label) => c.evaluate(`[...document.querySelectorAll('[data-board-pane="${p}"] .seg button')].find(b => b.textContent === ${JSON.stringify(label)}).click()`);
await seg("images", "แค่รูป");
await seg("movies", "แค่รูป");
await waitFor(`return document.querySelector('[data-board-pane="movies"]').classList.contains('only') && document.querySelector('[data-board-pane="images"]').classList.contains('only')`);
check("แบบแค่รูป ซ่อนชื่อไฟล์ แผงหนังเป็นช่องปก", await q("return getComputedStyle(document.querySelector('[data-board-img] .fn')).display === 'none' && !!document.querySelector('[data-board-movies].mvgrid') && !!document.querySelector('.mt .slot')"));
await sleep(300);
check("จำมุมมองไว้ในการตั้งค่า", (await inv("get_settings")).settings.linkBoardMovies === "only");
await boardHover([join(DL, "ember-poster-hd.jpg")], await pos("Iron Tide (2010)"));
await sleep(150);
check("แบบแค่รูป ลากจาก Explorer ขึ้นปล่อยเมาส์", await q(`const m = ${MT("Iron Tide (2010)")}; return m.classList.contains('target') && m.textContent.includes('ปล่อยเมาส์')`));
await shot("6-กระดาน-แค่รูป.png", "[data-link-board]", 900);
await boardHover([], { x: 2, y: 2 });
await seg("images", "มีชื่อไฟล์");
await seg("movies", "รายการ");
await sleep(200);

// เพิ่มโฟลเดอร์หนัง ชื่อมีจุด · หนังขึ้นชั้นวางด้วย (พี่กันตอบตอนทำแผน)
const EXTRA = join(DIR, "หนังเพิ่ม.ชุด2");
mkdirSync(EXTRA, { recursive: true });
cpSync(join(SRC, "หนัง", "Paper.Kites.2012.mkv"), join(EXTRA, "Pandan.Forest.2019.mkv"));
await boardDrop([EXTRA], await pane("movies"));
await waitFor("return document.querySelectorAll('[data-board-mv-folders] .pathline').length === 2");
await waitFor(`return !!${MT("Pandan Forest (2019)")}`, 30000);
check("ลากโฟลเดอร์หนังมาวาง แถวโฟลเดอร์เพิ่ม หนังขึ้นกระดาน", await q(`return !!${MT("Pandan Forest (2019)")}`));
check("โฟลเดอร์ที่เพิ่มอยู่ในชั้นวางด้วย", (await inv("get_settings")).settings.folders.includes(EXTRA));
await c.evaluate(`[...document.querySelectorAll('[data-board-rm-folder]')].find(b => b.dataset.boardRmFolder === ${JSON.stringify(EXTRA)}).click()`);
await waitFor("return !!document.querySelector('[data-board-rm-yes]')");
await c.evaluate("document.querySelector('[data-board-rm-yes]').click()");
await waitFor("return document.querySelectorAll('[data-board-mv-folders] .pathline').length === 1");
await waitFor(`return !${MT("Pandan Forest (2019)")}`, 30000);
check("เอาโฟลเดอร์ออก หนังหายจากกระดาน ไฟล์ยังอยู่", existsSync(join(EXTRA, "Pandan.Forest.2019.mkv")) && !(await inv("get_settings")).settings.folders.includes(EXTRA));

// กลับตาราง
await boardDrop([join(DL, "copper-tall.jpg")], await pos("Paper Kites (2012)"));
await waitFor(sentOf("Paper Kites (2012)"));
await c.evaluate("document.querySelector('[data-board-back]').click()");
await waitFor("return !!document.querySelector('[data-link-table]')");
check("กลับตาราง คู่จากกระดานรอยืนยันอยู่", (await statusOf("Paper Kites (2012)")) === "manual" && (await reasonOf("Paper Kites (2012)")) === "ลากจาก Explorer");

/* ---------- ขั้น 5 หน้าครอป ---------- */
const dims = (p) => spawnSync(join("src-tauri", "tools", "ffprobe.exe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", p], { encoding: "utf8" }).stdout.trim();
await c.evaluate(`${rowSel("Paper Kites (2012)")}.scrollIntoView({ block: 'center' })`);
// แถบแจ้งผลจากข้อก่อนหน้าทับหน้าต่างในภาพ ปิดให้หมดก่อนถ่าย
const closeToasts = () => c.evaluate("document.querySelectorAll('.toast .x').forEach((b) => b.click())");
await closeToasts();
await clickIn("Paper Kites (2012)", "[data-link-crop]");
await waitFor("return !!document.querySelector('[data-crop] .cropbox')");
check("หน้าครอปมีปรับเอียงกับช่องปก ไม่มีปรับสี ไม่มีเลือกชนิดไฟล์", await q("const d = document.querySelector('[data-crop]'); const t = d.closest('.dlg').textContent; return !!d.querySelector('[data-tilt]') && t.includes('ปกนอน 16 : 9') && !t.includes('ไฟล์รูปที่ได้') && !t.includes('ความสว่าง')"));
check("หัวหน้าต่างบอกชื่อหนัง ปุ่มเขียนว่าใช้ค่านี้ เพราะยังไม่เขียนไฟล์", await q("const d = document.querySelector('[data-crop]').closest('.dlg'); return d.textContent.includes('ครอปรูปปก · Paper Kites (2012)') && document.querySelector('[data-use]').textContent === 'ใช้ค่านี้'"));
check("ไม่มีตารางคุณภาพ ไม่มีตัวอย่างไอคอน Windows เพราะปกจับคู่ไม่เปลี่ยนไอคอนไฟล์", await q("const d = document.querySelector('[data-crop]'); return !d.querySelector('[data-qtable]') && d.querySelectorAll('[data-previews] .pv').length === 2 && !d.textContent.includes('ไอคอน Windows')"));
// มุมจับต้องหน้าตาเดียวกันทั้ง 4 มุม · เดิมมุมซ้ายล่างเป็นวงกลมขาว ชื่อคลาส sw ชนปุ่มเลือกธีมหน้ากราฟเสียง
const handlesSame = "const h = [...document.querySelectorAll('[data-crop] .hd')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), getComputedStyle(e).borderRadius].join(); }); return h.length === 4 && new Set(h).size === 1 && h[0].endsWith('3px')";
check("มุมจับทั้ง 4 มุมหน้าตาเดียวกัน", await q(handlesSame));
await c.evaluate("{ const s = document.createElement('style'); s.id = 'คืนบั๊กมุมจับ'; s.textContent = '.sw { width: 26px; height: 26px; border-radius: 50%; }'; document.head.append(s); }");
check("คืนบั๊กมุมจับชั่วคราว ตัวตรวจข้อบนต้องจับได้", !(await q(handlesSame)));
await c.evaluate("document.getElementById('คืนบั๊กมุมจับ').remove()");
const tiltClick = async (sel, n) => { for (let i = 0; i < n; i++) await c.evaluate(`document.querySelector(${JSON.stringify(sel)}).click()`); await sleep(120); };
await tiltClick("[data-tilt-plus]", 3);
check("ปรับเอียงทีละครึ่งองศา ขึ้น +1.5°", (await q("return document.querySelector('[data-tilt-val]').textContent")) === "+1.5°");
check("ภาพบนจอเอียงตาม ไม่ล้นกรอบ", await q("const i = document.querySelector('[data-crop] .stage img'); return i.style.transform.includes('rotate(1.5deg)') && i.parentElement.style.overflow === 'hidden'"));
await sleep(500);
await c.evaluate("document.querySelector('[data-use]').click()");
await waitFor("return !document.querySelector('[data-crop]')");
await waitFor(`return !!${rowSel("Paper Kites (2012)")}?.querySelector('[data-link-cropped]')`);
const r5 = await rowNow("Paper Kites (2012)");
check("ใช้รูปนี้ จำค่าครอปลงแถว ยังไม่เขียนรูป", r5.tall.geo?.tilt === 1.5 && !!r5.tall.cropThumb && !existsSync(moviePoster("Paper.Kites.2012")));
check("แถวโชว์ภาพหลังครอป", await q(`const i = ${rowSel("Paper Kites (2012)")}.querySelector('[data-link-chosen] img'); return decodeURIComponent(i.src).includes('crop-')`));
// เปิดอีกครั้ง ค่าเดิมกลับมา · ยกเลิกไม่เปลี่ยน
await clickIn("Paper Kites (2012)", "[data-link-crop]");
await waitFor("return !!document.querySelector('[data-crop] .cropbox')");
check("เปิดอีกครั้ง ค่าเอียงเดิมกลับมา", (await q("return document.querySelector('[data-tilt-val]').textContent")) === "+1.5°");
// กดยกเลิก ค่าที่ลองปรับไม่เข้าแถว
await tiltClick("[data-tilt-plus]", 2);
await c.evaluate("[...document.querySelectorAll('.dlg button')].find((b) => b.textContent === 'ยกเลิก').click()");
await waitFor("return !document.querySelector('[data-crop]')");
check("กดยกเลิก ค่าเอียงในแถวยังเท่าเดิม", (await rowNow("Paper Kites (2012)")).tall.geo?.tilt === 1.5);
await clickIn("Paper Kites (2012)", "[data-link-crop]");
await waitFor("return !!document.querySelector('[data-crop] .cropbox')");
await tiltClick("[data-tilt-minus]", 8);
check("เอียงทวนเข็มได้ ขึ้น −2.5°", (await q("return document.querySelector('[data-tilt-val]').textContent")) === "−2.5°");
// คีย์บอร์ด ลูกศรซ้ายขวาทีละครึ่งองศา ตามมอคอัปหน้า 4
await c.evaluate("document.querySelector('[data-tilt] .range').focus()");
await c.key("ArrowRight");
await sleep(80);
check("กดลูกศรขวาบนแถบเอียง ขึ้น −2°", (await q("return document.querySelector('[data-tilt-val]').textContent")) === "−2°");
await c.key("ArrowLeft");
await sleep(80);
// สลับไปปกนอน ค่าที่แก้ไว้ในช่องเดิมต้องไม่หายเงียบ (เดิมหาย ต้องกดใช้ค่านี้ก่อนสลับ)
await c.evaluate("[...document.querySelectorAll('.dlg .seg button')].find(b => b.textContent === 'ปกนอน 16 : 9').click()");
await waitFor("const b = document.querySelector('[data-crop] .cropbox'); if (!b) return false; const r = b.getBoundingClientRect(); return Math.abs(r.width / r.height - 16 / 9) < 0.05", 8000);
check("ช่องปกนอน กรอบครอป 16 : 9 ไม่มีตัวเลือกเติมขอบ", await q("const b = document.querySelector('[data-crop] .cropbox').getBoundingClientRect(); return Math.abs(b.width / b.height - 16 / 9) < 0.05 && !document.querySelector('.dlg').textContent.includes('เติมขอบ')"));
check("สลับช่องแล้ว ค่าเอียง −2.5° ของปกตั้งถูกจำลงแถว", (await rowNow("Paper Kites (2012)")).tall.geo?.tilt === -2.5);
await sleep(500);
await shot("9-ครอป-ปกนอน.png", ".dlg", 900);
await c.evaluate("document.querySelector('[data-use]').click()");
await waitFor("return !document.querySelector('[data-crop]')");
await waitFor(`return !!${rowSel("Paper Kites (2012)")}?.querySelectorAll('[data-link-chosen] img')[1]`);
const r6 = await rowNow("Paper Kites (2012)");
check("รูปเดียวได้ทั้งปกตั้งและปกนอน ค่าครอปแยกกัน", r6.wide?.path === r6.tall?.path && r6.wide?.geo?.aspect === "wide" && r6.tall?.geo?.tilt === -2.5);
await shot("10-ตาราง-หลังครอป.png", `[data-link-row="${r6.id.replace(/["\\]/g, "\\$&")}"]`);
await clickIn("Paper Kites (2012)", "[data-link-confirm]");
await waitFor(`return ${rowSel("Paper Kites (2012)")}?.dataset.linkStatus === 'saved'`);
check("ยืนยันแล้ว ปกตั้ง 1000 × 1500", dims(moviePoster("Paper.Kites.2012")) === "1000,1500", dims(moviePoster("Paper.Kites.2012")));
check("ยืนยันแล้ว ปกนอน 1920 × 1080", dims(join(MOV, "Paper.Kites.2012-landscape.jpg")) === "1920,1080", dims(join(MOV, "Paper.Kites.2012-landscape.jpg")));
check("รูปต้นฉบับไม่ถูกแก้ รูปที่ได้ไม่เหมือนต้นฉบับ", sha(join(DL, "copper-tall.jpg")) === sha(join(SRC, "รูปดาวน์โหลด", "copper-tall.jpg")) && sha(moviePoster("Paper.Kites.2012")) !== sha(join(DL, "copper-tall.jpg")));

// ตัวอย่างบนจอต้องตรงกับรูปจริงที่ได้ · ใช้รูปแถบสี เห็นการเอียงชัด เทียบด้วย ssim
// และเทียบกับรูปที่ไม่ได้เอียงเป็นตัวคุม ถ้าเอียงผิดทาง หรือไม่เอียงจริง คะแนนจะกลับด้าน
const ssim = (a, b, fa = "", fb = "") => {
  const r = spawnSync(join("src-tauri", "tools", "ffmpeg.exe"), ["-hide_banner", "-i", a, "-i", b, "-filter_complex", `[0]${fa}scale=110:165[a];[1]${fb}scale=110:165[b];[a][b]ssim`, "-f", "null", "-"], { encoding: "utf8" });
  return Number(/All:([\d.]+)/.exec(r.stderr)?.[1] ?? 0);
};
const BARS = join(DIR, "แถบสี.jpg");
cpSync(join("test-media", "สร้าง", "รูป", "wide.jpg"), BARS);
const t8 = await q("return [...document.querySelectorAll('[data-link-row]')].filter((r) => r.dataset.linkStatus !== 'saved').map((r) => r.querySelector('.lname b').textContent)[0] ?? null");
await dropOnRow(t8, [BARS]);
await waitFor(`return !!${rowSel(t8)}?.querySelector('[data-link-crop]') && ${rowSel(t8)}.textContent.includes('แถบสี.jpg')`);
const before8 = await rowNow(t8);
await clickIn(t8, "[data-link-crop]");
await waitFor("return !!document.querySelector('[data-crop] .cropbox')");
// สลับช่องโดยไม่ได้แก้อะไร แถวต้องไม่เปลี่ยน ไม่ขึ้นว่าครอปแล้ว
await c.evaluate("[...document.querySelectorAll('.dlg .seg button')].find(b => b.textContent === 'ปกนอน 16 : 9').click()");
await waitFor("const b = document.querySelector('[data-crop] .cropbox'); if (!b) return false; const r = b.getBoundingClientRect(); return Math.abs(r.width / r.height - 16 / 9) < 0.05", 8000);
const mid8 = await rowNow(t8);
check("สลับช่องโดยไม่ได้แก้อะไร แถวไม่เปลี่ยน", JSON.stringify(mid8.tall) === JSON.stringify(before8.tall) && JSON.stringify(mid8.wide) === JSON.stringify(before8.wide));
await c.evaluate("[...document.querySelectorAll('.dlg .seg button')].find(b => b.textContent === 'ปกตั้ง 2 : 3').click()");
await waitFor("const b = document.querySelector('[data-crop] .cropbox'); if (!b) return false; const r = b.getBoundingClientRect(); return Math.abs(r.width / r.height - 2 / 3) < 0.05", 8000);
await tiltClick("[data-tilt-plus]", 16);
check("เอียงได้ 8°", (await q("return document.querySelector('[data-tilt-val]').textContent")) === "+8°");
await sleep(600);
await closeToasts();
await shot("8-ครอป-ปรับเอียง.png", ".dlg", 900);
const pvShot = join(DIR, "ตัวอย่างบนจอ.png");
await c.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(300);
await c.shot(pvShot, "[data-previews] > div:nth-child(2) .pv", 0);
await c.send("Emulation.clearDeviceMetricsOverride");
await sleep(150);
await c.evaluate("document.querySelector('[data-use]').click()");
await waitFor("return !document.querySelector('[data-crop]')");
await waitFor(`return !!${rowSel(t8)}?.querySelector('[data-link-cropped]')`);
await clickIn(t8, "[data-link-confirm]");
await waitFor(`return ${rowSel(t8)}?.dataset.linkStatus === 'saved'`);
const r8 = await rowNow(t8);
const out8 = join(dirname(r8.movie), `${basename(r8.movie, extname(r8.movie))}-poster.jpg`);
const same8 = ssim(pvShot, out8), noTilt8 = ssim(pvShot, BARS, "", "crop=ih*2/3:ih,");
// เกณฑ์ 0.8 · ตัวอย่างบนจอมีมุมมนและมาจากภาพย่อ เปิดดูเทียบกับตาแล้วเส้นตรงกันทุกเส้นได้ 0.85 · ตัวคุมที่ไม่เอียงได้ 0.57
check("ตัวอย่างบนจอตรงกับรูปจริงที่ได้ คะแนนสูง และสูงกว่ารูปที่ไม่ได้เอียงชัดเจน", same8 > 0.8 && same8 - noTilt8 > 0.1,`ตรงกับรูปจริง ${same8} · ตรงกับรูปไม่เอียง ${noTilt8}`);

/* ---------- ขั้น 6 ชั้นวาง ตั้งค่า กันปิด ---------- */
const lib = async () => (await inv("get_library")).movies;
const mvOf = async (s) => (await lib()).find((m) => m.name.startsWith(s));
const tabN = (v) => q(`return Number(document.querySelector('[data-shelf-tab="${v}"]').textContent.replace(/\\D/g, ''))`);
const tabClick = async (v) => { await c.evaluate(`document.querySelector('[data-shelf-tab="${v}"]').click()`); await sleep(150); };
const BOOK = (s) => `document.querySelector(${JSON.stringify(`[data-movie^="${s}"]`)})`;
const pickBook = async (s) => {
  await c.evaluate(`${BOOK(s)}.click()`);
  await waitFor(`return document.querySelector('[data-detail] .nm')?.textContent.startsWith(${JSON.stringify(s)})`);
  await sleep(300);
};
const segClick = async (scope, label) => { await c.evaluate(`[...document.querySelectorAll(${JSON.stringify(scope + " .seg button")})].find((b) => b.textContent.includes(${JSON.stringify(label)})).click()`); await sleep(200); };
const toShelf = async () => { await closeToasts(); await nav("ชั้นวางหนัง"); await waitFor("return !!document.querySelector('[data-shelf-filter]')"); await sleep(250); };
const isLinked = (m) => (m.linked?.length ?? 0) > 0 && (!m.thumb || m.coverPick !== "file");
await toShelf();
await segClick(".shelfhead", "ภาพปก");
await segClick(".shelfhead", "ปกตั้ง");
const all0 = await lib();
const n0 = { all: all0.length, linked: all0.filter(isLinked).length, file: all0.filter((m) => !isLinked(m) && m.thumb).length, none: all0.filter((m) => !isLinked(m) && !m.thumb).length };
const t0 = { all: await tabN("all"), linked: await tabN("linked"), file: await tabN("file"), none: await tabN("none") };
check("ตัวกรอง 4 แท็บ ยอดตรงกับคลัง สามหมวดรวมเท่าทั้งหมด", JSON.stringify(n0) === JSON.stringify(t0) && t0.linked + t0.file + t0.none === t0.all && t0.linked > 0 && t0.file > 0, JSON.stringify(t0));

await tabClick("linked");
check("กรองปกจับคู่ ขึ้นเฉพาะเรื่องที่จับคู่ ทุกเล่มมีป้ายโซ่", await q(`const b = [...document.querySelectorAll('[data-shelf] .book')]; return b.length === ${t0.linked} && b.every((x) => x.querySelector('[data-linkb]'))`));
check("ป้ายโซ่อยู่ใต้ปก ไม่ทับรูป และอยู่หน้าชื่อหนัง", await q(`return [...document.querySelectorAll('[data-shelf] .book')].every((b) => { const l = b.querySelector('[data-linkb]'), k = b.querySelector('.cover'), n = b.querySelector('.bname'); return l.getBoundingClientRect().top >= k.getBoundingClientRect().bottom - 1 && n.contains(l); })`));
check("ปกจับคู่แสดงรูปจริงบนชั้นวาง", await waitFor("const i = document.querySelector('[data-shelf] .book img'); return !!i && i.complete && i.naturalWidth > 0", 8000));
await sleep(400);
await shot("11-ชั้นวาง-ปกจับคู่.png", ".main", 900);
await tabClick("none");
check("กรองยังไม่มีปก ไม่มีรูป ไม่มีป้ายโซ่", await q(`const b = [...document.querySelectorAll('[data-shelf] .book')]; return b.length === ${t0.none} && b.every((x) => x.querySelector('.cover.none') && !x.querySelector('[data-linkb]'))`));
await tabClick("file");
check("กรองปกในไฟล์ มีเรื่องที่รวมแล้ว ไม่มีป้ายโซ่", await q(`const b = [...document.querySelectorAll('[data-shelf] .book')]; return b.length === ${t0.file} && !!document.querySelector('[data-movie^="มีปกแล้ว"]') && b.every((x) => !x.querySelector('[data-linkb]'))`));
await tabClick("all");

await segClick(".shelfhead", "ปกนอน");
check("สลับปกนอนทั้งชั้น เรื่องที่มีปกนอนเป็นแนวนอน เรื่องที่มีแบบเดียวใช้แบบที่มี", await q(`return ${BOOK("Silent.Orbit")}.classList.contains('wide') && !${BOOK("Tidal")}.classList.contains('wide')`));
await segClick(".shelfhead", "ปกตั้ง");
check("สลับกลับปกตั้ง", await q(`return !${BOOK("Silent.Orbit")}.classList.contains('wide')`));
await segClick(".shelfhead", "ตาราง");
check("มุมมองตาราง ป้ายโซ่หน้าชื่อหนังครบ", await q(`return document.querySelectorAll('[data-table] tbody [data-linkb]').length === ${t0.linked}`));
await segClick(".shelfhead", "ภาพปก");

await pickBook("Harbor.Lights");
check("แผงขวาบอกว่าไม่ได้อยู่ในไฟล์ ไอคอนไฟล์ไม่เปลี่ยน เก็บในโปรแกรม", await q("const t = document.querySelector('[data-link-card]').textContent; return t.includes('ปกจับคู่ไว้ ไม่ได้อยู่ในไฟล์') && t.includes('ไอคอนไฟล์ใน Windows ยังไม่เปลี่ยน') && t.includes('harbor_lights_2021.png') && t.includes('เก็บสำเนาไว้ในโปรแกรม')"));
await pickBook("Tidal.2021");
check("เรื่องที่เก็บข้างไฟล์ บอกชื่อไฟล์ -poster", await q("return document.querySelector('[data-link-where]').textContent.includes('Tidal.2021.1080p-poster.jpg')"));
await shot("12-แผงขวา-ปกจับคู่.png", "[data-detail]", 1100);

// ครอปใหม่ · พาไปตาราง เปิดหน้าครอป ค่าเดิมกลับมา · หมุน พลิก เอียงพร้อมกัน ตัวอย่างบนจอต้องตรงกับรูปจริง
const stem8 = basename(r8.movie, extname(r8.movie));
await pickBook(stem8);
const shaOld8 = sha(out8), at8 = (await mvOf(stem8)).linked[0].at, old8 = join(DIR, "รูปก่อนครอปใหม่.jpg");
cpSync(out8, old8);
await c.evaluate("document.querySelector('[data-link-recrop]').click()");
await waitFor("return !!document.querySelector('[data-crop] .cropbox')", 15000);
check("ครอปใหม่ พาไปตาราง เปิดหน้าครอป ค่าเอียงเดิมกลับมา", await q(`return !!document.querySelector('[data-link-table]') && !!${rowSel(t8)} && document.querySelector('[data-tilt-val]').textContent === '+8°'`));
await c.evaluate("[...document.querySelectorAll('.dlg button')].find((b) => b.textContent === 'หมุนขวา').click()");
await c.evaluate("[...document.querySelectorAll('.dlg button')].find((b) => b.textContent === 'พลิกซ้ายขวา').click()");
await sleep(700);
const pvShot2 = join(DIR, "ตัวอย่างบนจอ2.png");
await c.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
await sleep(300);
await c.shot(pvShot2, "[data-previews] > div:nth-child(2) .pv", 0);
await c.send("Emulation.clearDeviceMetricsOverride");
await sleep(150);
await c.evaluate("document.querySelector('[data-use]').click()");
await waitFor("return !document.querySelector('[data-crop]')");
await sleep(300);
check("ครอปใหม่แล้วยังไม่ยืนยัน ไฟล์กับปกบนชั้นยังเป็นของเดิม", sha(out8) === shaOld8 && (await mvOf(stem8)).linked[0].at === at8);
await clickIn(t8, "[data-link-confirm]");
await waitFor(`return ${rowSel(t8)}?.dataset.linkStatus === 'saved'`);
const same9 = ssim(pvShot2, out8), old9 = ssim(pvShot2, old8);
// เกณฑ์ 0.75 · เปิดดูเทียบกับตาแล้วทิศและลำดับแถบสีตรงกัน ขอบคมต่างกันไม่ถึง 2 จุดจากการปัดเศษได้ 0.80 · ตัวคุมได้ 0.31
check("หมุน พลิก เอียงพร้อมกัน ตัวอย่างบนจอตรงกับรูปจริงที่ได้", same9 > 0.75 && same9 - old9 > 0.1,`ตรงกับรูปจริง ${same9} · ตรงกับรูปก่อนหมุน ${old9}`);
check("ยืนยันซ้ำ แทนไฟล์ของโปรแกรมเอง ไม่เกิดไฟล์ชื่อซ้ำ", sha(out8) !== shaOld8 && !existsSync(out8.replace("-poster.jpg", "-poster (2).jpg")));

// เปลี่ยนรูป แล้วเลิกแก้ · ปกเดิมคงอยู่ ไม่มีอะไรถูกเขียน
await toShelf();
await pickBook("Tidal.2021");
const tidalFile = moviePoster("Tidal.2021.1080p"), tidalSha = sha(tidalFile);
await c.evaluate("document.querySelector('[data-link-rechange]').click()");
await waitFor(`return ${rowSel("Tidal (2021)")}?.dataset.linkStatus === 'manual'`, 15000);
check("เปลี่ยนรูป พาไปแถวของเรื่องนั้น รูปเดิมมาตั้งรอไว้ เหตุที่จับคู่บอกว่ามาจากชั้นวาง", (await reasonOf("Tidal (2021)")) === "เลือกจากชั้นวาง");
await clickIn("Tidal (2021)", "[data-link-skip]");
await waitFor(`return !${rowSel("Tidal (2021)")}`);
check("กดเลิกแก้ แถวหาย ปกกับไฟล์ยังอยู่เหมือนเดิม", sha(tidalFile) === tidalSha && (await mvOf("Tidal.2021")).linked.length === 1);

// เปลี่ยนชื่อหนังในชั้นหนัง สำเนาข้างไฟล์เปลี่ยนชื่อตาม · เปลี่ยนกลับเพื่อให้ข้อถัดไปใช้ชื่อเดิม
const tidalId = (await mvOf("Tidal.2021")).id;
await inv("rename_movie", { id: tidalId, stem: "Tidal เปลี่ยนชื่อ" });
const tidalNew = moviePoster("Tidal เปลี่ยนชื่อ");
check("เปลี่ยนชื่อหนัง สำเนาเปลี่ยนชื่อตาม คลังจดชื่อใหม่", existsSync(tidalNew) && !existsSync(tidalFile) && (await lib()).find((m) => m.id === tidalId).linked[0].file === tidalNew);
await inv("rename_movie", { id: tidalId, stem: "Tidal.2021.1080p" });
check("เปลี่ยนชื่อกลับ สำเนากลับชื่อเดิม", existsSync(tidalFile) && !existsSync(tidalNew));

// อ่านโฟลเดอร์ใหม่ ปกจับคู่ต้องไม่หาย
const linkedBefore = JSON.stringify((await lib()).map((m) => [m.id, (m.linked ?? []).map((x) => x.thumb)]).sort());
await inv("scan_library");
for (let i = 0; i < 100; i++) { await sleep(200); if (!(await inv("get_library")).scanning) break; }
check("อ่านโฟลเดอร์ใหม่ ปกจับคู่อยู่ครบ", JSON.stringify((await lib()).map((m) => [m.id, (m.linked ?? []).map((x) => x.thumb)]).sort()) === linkedBefore);

// เอาปกออก · สำเนาของโปรแกรมลงถังขยะ รูปต้นฉบับไม่โดน
await toShelf();
await pickBook("Paper.Kites");
const pkTall = moviePoster("Paper.Kites.2012"), pkWide = join(MOV, "Paper.Kites.2012-landscape.jpg");
await c.evaluate("document.querySelector('[data-link-remove]').click()");
await waitFor("return !!document.querySelector('[data-link-remove-ok]')");
check("ถามก่อนเอาออก บอกชื่อไฟล์ที่ลงถังขยะ และรูปต้นฉบับไม่โดน", await q("const t = document.querySelector('[data-link-remove-ok]').closest('.dlg').textContent; return t.includes('Paper.Kites.2012-poster.jpg') && t.includes('Paper.Kites.2012-landscape.jpg') && t.includes('ถังขยะ') && t.includes('รูปต้นฉบับกับไฟล์หนังไม่ถูกแตะ')"));
await shot("13-เอาปกออก.png", ".dlg", 900);
await c.evaluate("document.querySelector('[data-link-remove-ok]').click()");
await waitFor("return !document.querySelector('[data-link-card]')");
check("เอาปกออก สำเนาหายจากโฟลเดอร์ รูปต้นฉบับยังอยู่ เล่มไม่มีป้ายโซ่", !existsSync(pkTall) && !existsSync(pkWide) && existsSync(join(DL, "copper-tall.jpg")) && (await q(`return !${BOOK("Paper.Kites")}.querySelector('[data-linkb]') && !!${BOOK("Paper.Kites")}.querySelector('.cover.none')`)));

// ปุ่มจับคู่รูปปก · พาไปแถว ลากรูปมาวาง รอยืนยัน ใช้ต่อกับแถบทำต่อและกันปิดข้างล่าง
await c.evaluate("document.querySelector('[data-shelflink]').click()");
await waitFor(`return !!${rowSel("Paper Kites (2012)")}`, 15000);
await dropOnRow("Paper Kites (2012)", [join(IMG, "tidal_alt.jpg")]);
await waitFor(`return ${rowSel("Paper Kites (2012)")}?.dataset.linkStatus === 'manual'`);
check("ปุ่มจับคู่รูปปก พาไปแถวในตาราง ลากรูปมาวาง คู่รอยืนยัน", (await rowNow("Paper Kites (2012)")).tall?.name === "tidal_alt.jpg");

// หน้าตั้งค่า 3 แบบ · ย้ายของเดิมทีเดียว · ไฟล์คนอื่นไม่โดน
const storeNow = () => c.evaluate("window.__TAURI_INTERNALS__.invoke('get_settings').then((r) => r.settings.linkStore)");
const pickMode = async (v) => { await c.evaluate(`document.querySelector('[data-link-mode="${v}"]').click()`); for (let i = 0; i < 40 && (await storeNow()) !== v; i++) await sleep(100); await sleep(250); };
const runMigrate = async () => {
  await c.evaluate("document.querySelector('[data-link-migrate-go]').click()");
  await waitFor("return !!document.querySelector('[data-link-migrate-ok]')");
  await c.evaluate("document.querySelector('[data-link-migrate-ok]').click()");
  await waitFor("return !document.querySelector('[data-link-migrate-ok]')", 60000);
  await sleep(300);
};
await closeToasts();
await nav("ตั้งค่า");
await waitFor("return !!document.querySelector('[data-setcard=\"link\"]')");
check("การ์ดเก็บรูป 3 แบบ ค่าตั้งต้นข้างไฟล์หนัง", await q("const m = [...document.querySelectorAll('[data-link-mode]')]; return m.length === 3 && m.find((x) => x.classList.contains('on')).dataset.linkMode === 'beside' && m[0].textContent.includes('-poster.jpg') && m[0].textContent.includes('-landscape.jpg')"));
check("การ์ดเรียงเต็มแถว ไม่ล้นหน้าต่าง", await q("const c = document.querySelector('[data-setcard=\"link\"]').getBoundingClientRect(), w = document.querySelector('[data-settings]').getBoundingClientRect(); return c.width > w.width * 0.8 && c.right <= w.right"));
await sleep(200);
await shot("14-ตั้งค่า-เก็บรูป.png", '[data-setcard="link"]', 1000);
await c.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 640, deviceScaleFactor: 1, mobile: false });
await sleep(350);
check("หน้าต่างเล็กสุด 1024 การ์ดเก็บรูปไม่ล้น ข้อความไม่ตกการ์ด", await q("const c = document.querySelector('[data-setcard=\"link\"]').getBoundingClientRect(); return document.querySelector('[data-settingsscroll]').scrollWidth <= document.querySelector('[data-settingsscroll]').clientWidth && [...document.querySelectorAll('[data-link-mode]')].every((m) => { const r = m.getBoundingClientRect(); return r.right <= c.right && m.scrollWidth <= m.clientWidth + 1; })"));
await c.send("Emulation.clearDeviceMetricsOverride");
await sleep(150);
await pickMode("link");
check("เปลี่ยนแบบ ขึ้นปุ่มย้ายของเดิม บอกจำนวนเรื่อง", await q("return !!document.querySelector('[data-link-migrate-go]') && /\\d+ เรื่อง/.test(document.querySelector('[data-link-migrate]').textContent)"));
const emberFile = join(MOV, "Ember (2022)-poster.jpg"), emberSha = sha(emberFile);
await runMigrate();
const inLink = (await lib()).filter((m) => m.linked?.length);
check("ย้ายเป็นจับคู่อย่างเดียว ทุกเรื่องเปลี่ยนแบบ สำเนาที่โปรแกรมทำหายจากโฟลเดอร์", inLink.every((m) => m.linked.every((x) => x.store === "link" && !x.file)) && !existsSync(tidalFile), `${inLink.length} เรื่อง`);
check("ย้ายแล้ว ไฟล์ที่โปรแกรมไม่ได้ทำไม่โดน", sha(emberFile) === emberSha && sha(harbor) === harborSha);

// ย้ายรูปต้นฉบับหนี · ชั้นวางบอกหารูปไม่เจอ ปกยังเห็นจากภาพเล็ก
const harborImg = join(IMG, "harbor_lights_2021.png"), harborHid = harborImg + ".ซ่อน";
renameSync(harborImg, harborHid);
await toShelf();
await pickBook("Harbor.Lights");
check("แบบจับคู่อย่างเดียว รูปต้นฉบับหาย แผงขวาบอกหารูปไม่เจอ ครอปใหม่กดไม่ได้ รวมเข้าไฟล์กดไม่ได้", await waitFor("return !!document.querySelector('[data-link-lost]') && document.querySelector('[data-link-recrop]').getAttribute('aria-disabled') === 'true' && document.querySelector('[data-link-merge]').getAttribute('aria-disabled') === 'true'", 4000));
await sleep(200);
await shot("15-หารูปไม่เจอ.png", "[data-detail]", 1100);
renameSync(harborHid, harborImg);

// ย้ายกลับข้างไฟล์หนัง · Harbor มีไฟล์ชื่อนี้ของคนอื่นอยู่ ต้องไม่เขียนทับ
await closeToasts();
await nav("ตั้งค่า");
await waitFor("return !!document.querySelector('[data-setcard=\"link\"]')");
await pickMode("beside");
await runMigrate();
const backNow = await lib();
check("ย้ายกลับข้างไฟล์หนัง ได้ไฟล์ -poster คืน", existsSync(tidalFile) && backNow.find((m) => m.name.startsWith("Tidal")).linked[0].store === "beside");
check("ย้ายกลับ เจอไฟล์ชื่อซ้ำของคนอื่น ไม่เขียนทับ เรื่องนั้นคงแบบเดิม แจ้งเตือน", sha(harbor) === harborSha && backNow.find((m) => m.name.startsWith("Harbor")).linked[0].store === "link" && (await q("return [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('ไม่สำเร็จ 1 เรื่อง'))")));

// เรื่องที่มีทั้งปกในไฟล์และปกจับคู่ เลือกได้ทีละเรื่อง
await toShelf();
await pickBook("มีปกแล้ว");
await c.evaluate("document.querySelector('[data-shelflink]').click()");
await waitFor(`return !!${rowSel("มีปกแล้ว (2017)")}`, 15000);
await dropOnRow("มีปกแล้ว (2017)", [join(IMG, "มีปกแล้ว (2017).jpg")]);
await waitFor(`return ${rowSel("มีปกแล้ว (2017)")}?.querySelector('[data-link-confirm]') && ${rowSel("มีปกแล้ว (2017)")}?.dataset.linkStatus === 'manual'`);
await clickIn("มีปกแล้ว (2017)", "[data-link-confirm]");
await waitFor(`return ${rowSel("มีปกแล้ว (2017)")}?.dataset.linkStatus === 'saved'`);
await toShelf();
await pickBook("มีปกแล้ว");
const srcBoth = () => q(`return ${BOOK("มีปกแล้ว")}.querySelector('img').src`);
const linkedSrc = await srcBoth();
check("สองปก ค่าตั้งต้นแสดงปกจับคู่ มีป้ายโซ่ มีปุ่มเลือก", await q(`return !!${BOOK("มีปกแล้ว")}.querySelector('[data-linkb]') && !!document.querySelector('[data-link-pick]')`));
await shot("16-สองปก-เลือกได้.png", "[data-detail]", 1100);
const beforeFile = await tabN("file");
await segClick("[data-link-pick]", "ปกในไฟล์");
await waitFor(`return !${BOOK("มีปกแล้ว")}.querySelector('[data-linkb]')`);
check("เลือกปกในไฟล์ รูปเปลี่ยน ป้ายโซ่หาย ยอดหมวดย้ายตาม", (await srcBoth()) !== linkedSrc && (await tabN("file")) === beforeFile + 1 && (await q("return document.querySelector('[data-link-card]').textContent.includes('ตอนนี้แสดงปกในไฟล์')")));
await segClick("[data-link-pick]", "ปกจับคู่");
await waitFor(`return !!${BOOK("มีปกแล้ว")}.querySelector('[data-linkb]')`);
check("เลือกกลับปกจับคู่ รูปกลับมา จำค่าในคลัง", (await srcBoth()) === linkedSrc && ((await mvOf("มีปกแล้ว")).coverPick ?? "") === "");

// รวมเข้าไฟล์ · พาไปหน้าใส่โปสเตอร์พร้อมไฟล์หนัง รูป และค่าครอป ไม่ต้องครอปซ้ำ
await pickBook("Night.Bus");
await c.evaluate("document.querySelector('[data-link-merge]').click()");
await waitFor("return !!document.querySelector('[data-poster-page]') && document.querySelector('[data-card=\"movie\"]').textContent.includes('Night.Bus') && document.querySelector('[data-card=\"poster\"]').textContent.includes('poster_tt7654321') && !!document.querySelector('[data-start]') && document.querySelector('[data-start]').getAttribute('aria-disabled') !== 'true'", 15000);
check("รวมเข้าไฟล์ ใส่ไฟล์หนังกับรูปให้ ไม่ขึ้นหน้าครอป ปุ่มเริ่มกดได้", await q("return !document.querySelector('[data-crop]') && !!document.querySelector('[data-card=\"movie\"]') && document.querySelector('[data-start]').getAttribute('aria-disabled') !== 'true'"));
await shot("17-รวมเข้าไฟล์.png", "[data-poster-page]", 1000);
await c.evaluate("document.querySelector('[data-start]').click()");
for (let i = 0; i < 300; i++) { const n = await mvOf("Night.Bus"); if (n.thumb && (await inv("running_jobs")) === 0) break; await sleep(200); }
const nb = await mvOf("Night.Bus");
check("รวมเข้าไฟล์เสร็จ มีปกในไฟล์ ปกจับคู่ยังอยู่ เลือกได้", !!nb.thumb && nb.hasCover && nb.linked.length === 1);

// แถบทำต่อ · เปิดโปรแกรมมาแล้วมีคู่ค้าง
await c.evaluate("location.reload()");
await waitFor("return !!document.querySelector('.side .nav')");
await waitFor("return !!document.querySelector('[data-link-resume]')", 8000);
const waitN = (await stateNow()).waiting;
check("เปิดใหม่มีคู่ค้าง ชั้นวางขึ้นแถบทำต่อ บอกจำนวนถูก", (await q("return document.querySelector('[data-link-resume]').textContent")).includes(`ทำต่อ ${waitN} คู่ที่ค้างไว้`), waitN);
await shot("18-แถบทำต่อ.png", "[data-link-resume]", 900);
await c.evaluate("document.querySelector('[data-link-resume-later]').click()");
await sleep(150);
check("กดไว้ทีหลัง แถบหาย", await q("return !document.querySelector('[data-link-resume]')"));
await c.evaluate("location.reload()");
await waitFor("return !!document.querySelector('[data-link-resume-go]')", 8000);
await c.evaluate("document.querySelector('[data-link-resume-go]').click()");
await waitFor("return !!document.querySelector('[data-link-table]')");
check("กดทำต่อ พาไปตารางตรวจผล คู่ที่รอยังอยู่", (await statusOf("Paper Kites (2012)")) === "manual");
await nav("ชั้นวางหนัง");
await waitFor("return !!document.querySelector('[data-shelf-filter]')");
check("เข้าตารางแล้ว แถบทำต่อไม่ขึ้นซ้ำ", await q("return !document.querySelector('[data-link-resume]')"));

// กันปิด · กดปุ่มปิดจริงของแถบชื่อ ฝั่ง Rust กันไว้ · __closeDry ไม่ให้ปิดจริงตอนตอบ
await c.click(".titlebar .ctl button.close");
check("กดปิดตอนมีคู่รอ ขึ้นหน้าต่างถาม โปรแกรมไม่ปิด", await waitFor("return !!document.querySelector('[data-closepairs]')", 4000));
check("หน้าต่างถามบอกจำนวนรอกับติ๊ก ปิดแล้วไม่หาย มี 3 ปุ่ม", await q(`const d = document.querySelector('[data-closepairs]').closest('.dlg'), t = d.textContent; return t.includes('ยังไม่ได้ยืนยัน ${waitN} คู่') && t.includes('ปิดโดยไม่ยืนยันก็ไม่หาย') && t.includes('ทำต่อ ${waitN} คู่ที่ค้างไว้') && !!d.querySelector('[data-closepairs-skip]') && !!d.querySelector('[data-closepairs-back]') && !!d.querySelector('[data-closepairs-ok]')`));
await shot("19-กันปิด.png", ".dlg", 900);
await c.evaluate("document.querySelector('[data-closepairs-back]').click()");
await waitFor("return !!document.querySelector('[data-link-table]')");
check("กดกลับไปดูก่อน พาไปตารางตรวจผล", await q("return !document.querySelector('[data-closepairs]')"));
await c.evaluate("window.__closeDry = true");
await c.click(".titlebar .ctl button.close");
await waitFor("return !!document.querySelector('[data-closepairs-skip]')", 4000);
await c.evaluate("document.querySelector('[data-closepairs-skip]').click()");
await sleep(150);
check("กดปิดโดยไม่ยืนยัน สั่งปิด คู่ที่รอไม่หาย", (await c.evaluate("window.__closedDry === true")) && (await stateNow()).waiting === waitN);
await c.evaluate("window.__closedDry = false");
await c.click(".titlebar .ctl button.close");
await waitFor("return !!document.querySelector('[data-closepairs-ok]')", 4000);
await c.evaluate("document.querySelector('[data-closepairs-ok]').click()");
check("กดยืนยันที่ติ๊กแล้วปิด ยืนยันครบ แล้วสั่งปิด", await waitFor("return window.__closedDry === true", 30000) && (await rowNow("Paper Kites (2012)")).status === "saved" && existsSync(moviePoster("Paper.Kites.2012")));
await c.evaluate("window.__closeDry = false");

const after = Object.keys(movieHash0).filter((p) => !p.includes("Night.Bus") && sha(p) !== movieHash0[p]);
check("จบขั้น 6 ไฟล์หนังทุกเรื่องเท่าเดิม ยกเว้นเรื่องที่กดรวมเข้าไฟล์เอง", after.length === 0, after.join(" "));
check("จบขั้น 6 รูปต้นฉบับทุกรูปเท่าเดิม", JSON.stringify(hashes(IMG)) === JSON.stringify(imgHash0));

const pass = results.filter((r) => r.pass).length;
console.log(`\nผ่าน ${pass} จาก ${results.length} ข้อ`);
c.close();
if (pass !== results.length) process.exitCode = 1;
void statSync;
