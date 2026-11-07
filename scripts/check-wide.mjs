// เทสปกแนวนอน (พี่กัน 7 พ.ย. 2569 *"ระบบที่เเสดงตรงนี้ ถ้าเราเอาโปสเตอร์แบบเเนวนอนมา มันก็จะเเสดงเป็เเเนวนอนด้วยนะ"*)
// ใช้: node scripts/check-wide.mjs [--built]  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1)
// ผ่านเมื่อ หน้าครอปมีแบบ ตามรูปเดิม ตัวอย่างเป็นแนวนอน · ใส่ปกแล้วปกในไฟล์เป็นแนวนอน 1500 กว้าง · ชั้นวางวางเล่มนั้นกว้างตามสัดส่วน สูงเท่าเล่มอื่น
//          แผงขวากับตารางแสดงแนวนอน · ภาพเล็กแบบเก่าที่ตัด 2:3 ถูกสร้างใหม่แบบคงสัดส่วน
import { mkdirSync, rmSync, readdirSync, copyFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";

// ที่อยู่เต็ม · โหมด dev โปรแกรมทำงานจากโฟลเดอร์ src-tauri ที่อยู่แบบสั้นหารูปไม่เจอ
const SRC = resolve("test-media", "สร้าง", "หนัง"), IMG = resolve("test-media", "สร้าง", "รูป");
const TMP = "D:\\dev\\tmp";
for (const d of readdirSync(TMP)) if (d.startsWith("ชั้นปกแนวนอน")) rmSync(join(TMP, d), { recursive: true, force: true });
const DIR = join(TMP, `ชั้นปกแนวนอน-${Date.now()}`);
const BUILT = process.argv.includes("--built");
const OUT = "docs/report-2026-11-07/ปกแนวนอน";
mkdirSync(OUT, { recursive: true });
mkdirSync(DIR, { recursive: true });
copyFileSync(join(SRC, "Harbor Lights (2021).mkv"), join(DIR, "Harbor Lights (2021).mkv")); // มีปกตั้ง 2:3 อยู่แล้ว
copyFileSync(join(SRC, "ดาวเหนือ (2023).mkv"), join(DIR, "ดาวเหนือ (2023).mkv")); // ยังไม่มีปก จะใส่ปกแนวนอน
const wideDims = execFileSync(join("src-tauri", "tools", "ffprobe.exe"), ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", join(IMG, "wide.jpg")], { encoding: "utf8" }).trim().split(",").map(Number);
const AR = wideDims[0] / wideDims[1];

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const text = (sel) => q(`return document.querySelector(${JSON.stringify(sel)})?.innerText.replace(/\\s+/g, ' ') ?? ''`);
const waitFor = async (js, ms = 30000) => { for (let t = 0; t < ms; t += 150) { if (await q(js)) return true; await sleep(150); } return false; };
const shot = async (f, sel) => { await c.evaluate("document.querySelectorAll('.toast .x').forEach(b => b.click())"); await c.move(500, 12); await sleep(300); return c.shot(`${OUT}/${f}`, sel, 6); };
const clickText = (sel, t) => c.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.innerText.trim() === ${JSON.stringify(t)})?.click()`);
/** ลากไฟล์มาวางที่ช่อง · ส่งเหตุการณ์เดียวกับที่ Windows ส่ง ตำแหน่งเป็นจุดภาพจริงของจอ */
const drop = async (path, zone) => {
  const pos = await q(`const r = document.querySelector('[data-drop=${zone}]').getBoundingClientRect(); return { x: (r.left + 20) * devicePixelRatio, y: (r.top + 20) * devicePixelRatio };`);
  // โหมด dev หน้าใส่โปสเตอร์มีตัวช่วยลากวาง (ตัวเทสขั้น 4 ใช้) · ตัวจริงไม่มี ใช้เหตุการณ์แบบที่ Windows ส่ง
  if (await q("return typeof window.__posterDrop === 'function'")) { await c.evaluate(`window.__posterDrop([${JSON.stringify(path)}], ${pos.x}, ${pos.y})`); return; }
  await c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: [${JSON.stringify(path)}], position: ${JSON.stringify(pos)} } })`);
};

await inv("set_settings", { patch: { folders: [DIR], viewMode: "grid", coverSize: "m", coverOrient: "tall" } });
if (BUILT) {
  await c.send("Page.enable");
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ dir: e.violatedDirective, uri: e.blockedURI }));" });
}
await c.evaluate("location.hash = ''; location.reload()"); await sleep(2500);
await waitFor("return document.querySelectorAll('.book').length >= 2", 60000);
await sleep(800);

// ภาพเล็กแบบเก่าที่ตัด 2:3 สร้างใหม่แบบคงสัดส่วน (ชื่อลงท้าย -a)
const lib0 = await inv("get_library");
const harbor = lib0.movies.find((m) => m.name === "Harbor Lights (2021)");
check("ปกตั้งเดิม ภาพเล็กสร้างแบบคงสัดส่วน (ชื่อลงท้าย -a) และจดสัดส่วนปก", harbor?.thumb?.endsWith("-a.jpg") && harbor.coverAspect > 0.6 && harbor.coverAspect < 0.7, `${harbor?.thumb?.split("\\").pop()} · ${harbor?.coverAspect}`);

// ---------- แผงขวาขึ้นเฉพาะตอนกดเลือกเรื่อง มีปุ่มปิด (คิว 6) ----------
// พี่กัน *"แถบนี้ เราอยากให้มันขึ้นตอนที่กดหนังนั้นๆ เเละมีปุ่มปิดได้ เราอยากห้มันเเสดงชั้นวางมากกว่า"*
const shelfW = () => q("return Math.round(document.querySelector('.shelfwrap').getBoundingClientRect().width)");
const noPanel = await q("return !document.querySelector('[data-detail]')"), sw0 = await shelfW();
await shot("10-ชั้นวาง-ยังไม่เลือก-ไม่มีแผงขวา.png");
await c.click('.book[data-movie="Harbor Lights (2021)"]'); await sleep(400);
const panelOn = await q("return document.querySelector('[data-detail] .nm')?.innerText ?? ''"), sw1 = await shelfW();
await shot("11-ชั้นวาง-กดเลือก-แผงขวาขึ้น.png");
await c.click("[data-detailclose]"); await sleep(400);
const closed = await q("return !document.querySelector('[data-detail]') && !document.querySelector('.book.sel')"), sw2 = await shelfW();
check("เปิดชั้นวางยังไม่มีแผงขวา ชั้นวางกว้างเต็ม · กดเรื่องแล้วแผงขวาขึ้นเรื่องนั้น · กดปุ่มปิดแล้วแผงหาย ชั้นวางกว้างคืน", noPanel && panelOn.includes("Harbor") && closed && sw0 > sw1 + 250 && sw2 === sw0,
  `ชั้นวางกว้าง ${sw0} → กดเลือก ${sw1} → ปิด ${sw2} จุดภาพ · แผงขึ้น ${panelOn}`);

// ---------- หน้าใส่โปสเตอร์ แบบตามรูปเดิม ----------
await c.evaluate("[...document.querySelectorAll('button.nav')].find(b => b.innerText.includes('ใส่โปสเตอร์')).click()"); await sleep(600);
await drop(join(DIR, "ดาวเหนือ (2023).mkv"), "movie"); await sleep(1500);
await drop(join(IMG, "wide.jpg"), "poster");
const cropOpen = await waitFor("return !!document.querySelector('[data-crop]')", 10000);
await clickText("[data-crop] .seg button", "ตามรูปเดิม"); await sleep(500);
const pv = await q("return [...document.querySelectorAll('[data-previews] .pv')].map(p => { const r = p.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height), Math.round(r.top)]; })");
const hint = await q("return [...document.querySelectorAll('[data-crop] .small')].map(e => e.innerText).join(' | ')");
check("หน้าครอปมีแบบ ตามรูปเดิม · ตัวอย่างทั้งสามเป็นแนวนอน อยู่แถวเดียวกัน", cropOpen && pv.length === 3 && pv.every((p) => p[0] > p[1]) && new Set(pv.map((p) => p[2] + p[1])).size === 1 && hint.includes("ใช้ทั้งรูปตามสัดส่วนเดิม"), `ตัวอย่าง ${pv.map((p) => p[0] + "×" + p[1]).join(" · ")}`);
await shot("01-หน้าครอป-ตามรูปเดิม.png", "[data-crop]");
await c.evaluate("document.querySelector('[data-use]').click()");
await waitFor("return !document.querySelector('[data-crop]') && !!document.querySelector('[data-pp]')", 15000); await sleep(600);
const card = await text("[data-card=poster]");
const pp = await q("const p = document.querySelector('[data-pp]'); return [p.clientWidth, p.clientHeight]");
check("ใช้รูปแล้ว การ์ดรูปบอก 1500 กว้าง คงสัดส่วน และ ใช้ตามรูปเดิม · รูปตัวอย่างเป็นแนวนอน", card.includes("1500 × " + Math.round(1500 / AR)) && card.includes("ใช้ตามรูปเดิม ไม่ตัด") && pp[0] > pp[1], `${card} · ${pp.join(" × ")}`);
await shot("02-การ์ดรูป-แนวนอน.png", "[data-card=poster]");
await c.evaluate("document.querySelector('[data-start]').click()");
for (let i = 0; i < 200; i++) { const r = await q("return document.querySelector('[data-run]')?.dataset.run"); if (r === "done" || r === "failed") break; await sleep(150); }
const run = await text("[data-run]");
const MKVMERGE = join("src-tauri", "tools", "mkvmerge.exe");
const attNames = (f) => (JSON.parse(execFileSync(MKVMERGE, ["-J", f], { encoding: "utf8" })).attachments ?? []).map((a) => a.file_name).sort();
const att1 = attNames(join(DIR, "ดาวเหนือ (2023).mkv"));
check("ใส่ปกแนวนอนให้ MKV สำเร็จ · รูปแนวนอนแนบชื่อ cover_land.jpg ตามธรรมเนียมปกแนวนอน", /เสร็จ|ใส่ปก/.test(run) && !/ไม่ได้|ผิดพลาด/.test(run) && att1.join(" ") === "cover_land.jpg", `${run} · ไฟล์แนบ ${att1.join(" ")}`);

// ---------- ชั้นวาง ----------
await c.evaluate("[...document.querySelectorAll('button.nav')].find(b => b.innerText.includes('ชั้นวางหนัง')).click()"); await sleep(600);
const gotWide = await waitFor("return !!document.querySelector('.book.wide[data-movie=\"ดาวเหนือ (2023)\"]')", 30000);
const w = await q("const b = (n) => document.querySelector(`.book[data-movie=\"${n}\"]`); const c1 = b('ดาวเหนือ (2023)').querySelector('.cover'), c2 = b('Harbor Lights (2021)').querySelector('.cover'); return { wideW: c1.clientWidth, wideH: c1.clientHeight, tallW: c2.clientWidth, tallH: c2.clientHeight };");
const expectW = Math.round(110 * 1.5 * Math.min(AR, 16 / 9));
check("ชั้นวาง ปกแนวนอนกว้างตามสัดส่วน สูงเท่าเล่มอื่น · ปกตั้งกว้างเท่าเดิม", gotWide && w.wideH === w.tallH && Math.abs(w.wideW - expectW) <= 2 && w.tallW === 110, `${JSON.stringify(w)} คาด ${expectW}`);
await shot("03-ชั้นวาง-ปกแนวนอน.png", "[data-shelf]");
for (const sz of ["เล็ก", "ใหญ่"]) {
  await clickText(".seg button", sz); await sleep(400);
  const ws = await q("const c1 = document.querySelector('.book.wide .cover'), c2 = document.querySelector('.book:not(.wide) .cover'); return [c1.clientWidth, c1.clientHeight, c2.clientWidth, c2.clientHeight]");
  check(`ขนาด${sz} ปกแนวนอนสูงเท่าเล่มอื่น`, ws[1] === ws[3] && ws[0] > ws[1], ws.join(" · "));
}
await clickText(".seg button", "กลาง"); await sleep(300);
await c.click('.book[data-movie="ดาวเหนือ (2023)"]'); await sleep(500);
const dp = await q("const d = document.querySelector('.dposter'); return [d.className, d.clientWidth, d.clientHeight]");
check("แผงขวา ปกแนวนอนกว้างเต็มแผง ไม่ถูกตัด", dp[0].includes("wide") && dp[1] > dp[2], dp.join(" · "));
await shot("04-แผงขวา-ปกแนวนอน.png", ".detail");
await clickText(".seg button", "ตาราง"); await sleep(500);
const th = await q("const t = document.querySelector('.lv .th.wide'); return t ? [t.clientWidth, t.clientHeight] : null");
check("ตาราง ภาพเล็กของปกแนวนอนเป็นแนวนอน", th && th[0] > th[1], th?.join(" × "));
// ภาพเล็กอยู่กลางช่องทั้งปกตั้งและปกแนวนอน (พี่กัน *"ตอนปรับเป็นมุมมองตารา เราอยากห้รู้มันอยู่เเนวกลาง"*)
const off = await q("return [...document.querySelectorAll('.lv tbody td:first-child')].map(td => { const a = td.getBoundingClientRect(), i = td.querySelector('.th').getBoundingClientRect(); return Math.round(Math.abs((a.left + a.right) / 2 - (i.left + i.right) / 2)); })");
check("ตาราง ภาพเล็กอยู่กลางช่องทั้งปกตั้งและปกแนวนอน", off.length === 2 && off.every((d) => d <= 1), `ห่างจากกลางช่อง ${off.join(" · ")} จุดภาพ`);
await shot("05-ตาราง-ปกแนวนอน.png", ".lv");
await clickText(".seg button", "ภาพปก"); await sleep(300);

// ---------- ปกตั้งกับปกนอนในไฟล์เดียว สลับดูบนชั้นวาง (คิว 5) ----------
// พี่กัน *"ทำระบบนี้มาเลย ให้เเนบหลายรูปได้ เเละทำระบบที่ดูรูปแบบเเนวตั้ง หรือเเนวนอนได้ ยกเว้นเรื่องนั้นๆมีเเค่เเนวเดียวมันจะเเสดงเเค่เเนวนั้น"*
const attach = async (img, mode) => {
  await c.evaluate("[...document.querySelectorAll('button.nav')].find(b => b.innerText.includes('ใส่โปสเตอร์')).click()"); await sleep(600);
  await drop(join(DIR, "ดาวเหนือ (2023).mkv"), "movie"); await sleep(1500);
  await drop(join(IMG, img), "poster");
  await waitFor("return !!document.querySelector('[data-crop]')", 10000);
  await clickText("[data-crop] .seg button", mode); await sleep(400);
  await c.evaluate("document.querySelector('[data-use]').click()");
  await waitFor("return !document.querySelector('[data-crop]') && !!document.querySelector('[data-pp]')", 15000); await sleep(500);
  await c.evaluate("document.querySelector('[data-start]').click()");
  for (let i = 0; i < 200; i++) { const r = await q("return document.querySelector('[data-run]')?.dataset.run"); if (r === "done" || r === "failed") break; await sleep(150); }
  return text("[data-run]");
};
const run2 = await attach("poster.jpg", "ตัดให้พอดี 2 : 3");
const att2 = attNames(join(DIR, "ดาวเหนือ (2023).mkv"));
check("ใส่ปกตั้งเพิ่มให้ไฟล์ที่มีปกนอนอยู่แล้ว · ไฟล์แนบ cover.jpg กับ cover_land.jpg ปกนอนเดิมยังอยู่ · หน้าจอบอกว่าปกนอนยังอยู่", att2.join(" ") === "cover.jpg cover_land.jpg" && run2.includes("ปกแนวนอนเดิมยังอยู่"), `ไฟล์แนบ ${att2.join(" ")} · ${run2}`);
await shot("06-ใส่ปกตั้งเพิ่ม-ปกนอนยังอยู่.png", "[data-run]");
const lib2 = await inv("get_library"), dao2 = lib2.movies.find((m) => m.name === "ดาวเหนือ (2023)"), har2 = lib2.movies.find((m) => m.name === "Harbor Lights (2021)");
check("คลังหนังจดสองปก ปกตั้งเป็นปกหลัก ปกนอนเป็นปกที่สอง · เรื่องที่มีปกเดียวไม่มีปกที่สอง", dao2?.thumb && dao2.coverAspect < 1 && dao2.thumb2 && dao2.cover2Aspect >= 1 && dao2.cover2Name === "cover_land.jpg" && !har2?.thumb2,
  `ดาวเหนือ ${dao2?.coverName} ${dao2?.coverAspect?.toFixed(2)} · ${dao2?.cover2Name} ${dao2?.cover2Aspect?.toFixed(2)} · Harbor ปกที่สอง ${har2?.thumb2 ?? "ไม่มี"}`);

await c.evaluate("[...document.querySelectorAll('button.nav')].find(b => b.innerText.includes('ชั้นวางหนัง')).click()"); await sleep(800);
const wideOf = (n) => q(`return document.querySelector('.book[data-movie="${n}"]')?.classList.contains('wide') ?? null`);
await clickText(".seg button", "ปกตั้ง"); await sleep(400);
const tallState = [await wideOf("ดาวเหนือ (2023)"), await wideOf("Harbor Lights (2021)")];
await shot("07-ชั้นวาง-ดูปกตั้ง.png", "[data-shelf]");
await clickText(".seg button", "ปกนอน"); await sleep(500);
const wideState = [await wideOf("ดาวเหนือ (2023)"), await wideOf("Harbor Lights (2021)")];
const orientSaved = (await inv("get_settings")).settings?.coverOrient ?? (await inv("get_settings")).coverOrient;
check("ชั้นวาง ปุ่มดูปก · ปกตั้ง ดาวเหนือขึ้นปกตั้ง · ปกนอน ดาวเหนือขึ้นปกนอน · Harbor มีแค่ปกตั้งขึ้นปกตั้งทั้งสองแบบ · จำค่าไว้",
  tallState[0] === false && tallState[1] === false && wideState[0] === true && wideState[1] === false && orientSaved === "wide", `ปกตั้ง ${JSON.stringify(tallState)} · ปกนอน ${JSON.stringify(wideState)} · ค่าที่จำ ${orientSaved}`);
await shot("08-ชั้นวาง-ดูปกนอน.png", "[data-shelf]");
await c.click('.book[data-movie="ดาวเหนือ (2023)"]'); await sleep(400);
const dpWide = await q("return document.querySelector('.dposter')?.classList.contains('wide')");
await clickText(".seg button", "ตาราง"); await sleep(500);
const thWide = await q("return [...document.querySelectorAll('.lv tbody tr')].map((tr) => !!tr.querySelector('.th.wide'))");
check("ดูปกนอน แผงขวากับตารางขึ้นปกนอนของดาวเหนือ · Harbor ในตารางยังเป็นปกตั้ง", dpWide === true && thWide.filter(Boolean).length === 1, `แผงขวา ${dpWide} · ตาราง ${JSON.stringify(thWide)}`);
await clickText(".seg button", "ภาพปก"); await sleep(300);

// ใส่ปกนอนใหม่ แทนเฉพาะปกนอนเดิม ปกตั้งยังอยู่
const run3 = await attach("wide.jpg", "ตามรูปเดิม");
const att3 = attNames(join(DIR, "ดาวเหนือ (2023).mkv"));
check("ใส่ปกนอนใหม่ แทนเฉพาะปกนอนเดิม · ไฟล์แนบยังเป็น cover.jpg กับ cover_land.jpg อย่างละอัน · หน้าจอบอกว่าปกตั้งยังอยู่", att3.join(" ") === "cover.jpg cover_land.jpg" && run3.includes("ปกแนวตั้งเดิมยังอยู่"), `ไฟล์แนบ ${att3.join(" ")} · ${run3}`);
await c.evaluate("[...document.querySelectorAll('button.nav')].find(b => b.innerText.includes('ชั้นวางหนัง')).click()"); await sleep(600);
await clickText(".seg button", "ปกตั้ง"); await sleep(300);

if (BUILT) {
  const csp = await q("return window.__csp ?? null");
  check("ตัวโปรแกรมที่สร้างจริง ไม่มีอะไรโดนกติกาความปลอดภัยกัน", Array.isArray(csp) && csp.length === 0, JSON.stringify(csp));
}
const pass = results.filter((r) => r.pass).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 1));
c.close();
process.exit(pass === results.length ? 0 : 1);
