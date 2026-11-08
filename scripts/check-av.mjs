// เทสหน้าเสียงและซับ (แผนเสียงและซับ ขั้น 2) ในหน้าต่างโปรแกรมจริง ผ่านพอร์ตดีบัก · ถ่ายภาพทุกสถานะลงโฟลเดอร์รายงาน
// ลากไฟล์จำลองด้วยตัวรับไฟล์ของหน้า (window.__avDrop มีเฉพาะตอนทดสอบ) · ไฟล์หนังเป็นสำเนาในโฟลเดอร์ทดสอบ ไม่แตะ test-media
// ใช้: node scripts/check-av.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1 แบบอยู่หลังสุด)
import { mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const ROOT = process.cwd();
const AV = join(ROOT, "test-media", "สร้าง", "เสียงซับ");
const IMG = join(ROOT, "test-media", "สร้าง", "รูป");
const T = join(ROOT, "src-tauri", "tools");
const DIR = "D:\\dev\\tmp\\ชั้นหน้าเสียงซับ";
const OUT = "docs/report-2026-11-07/เสียงซับ-ขั้น2";
mkdirSync(OUT, { recursive: true });
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const ident = (p) => JSON.parse(spawnSync(join(T, "mkvmerge.exe"), ["-J", p], { encoding: "utf8", maxBuffer: 64 << 20 }).stdout || "{}");

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const shot = async (f, sel, pad = 0) => { await c.move(5, 700); await sleep(250); return c.shot(`${OUT}/${f}`, sel, pad); };
const waitFor = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const drop = (paths) => c.evaluate(`window.__avDrop(${JSON.stringify(paths)}, 400, 300)`);
const row = (i) => `document.querySelectorAll('.trk:not(.head)')[${i}]`;

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
copyFileSync(join(AV, "ดาวตก (2024).mkv"), join(DIR, "ดาวตก (2024).mkv"));
const MOVIE = join(DIR, "ดาวตก (2024).mkv");
const h0 = sha(MOVIE);
await inv("dev_fake_free", { bytes: 0 });
await inv("set_settings", { patch: { folders: [DIR], originalAfter: "keep", outputFormat: "mkv", checkSourceBefore: true, checkOutputAfter: true } });
await c.evaluate("localStorage.removeItem('ms.codecLast'); location.hash = ''; location.reload()");
await sleep(1500);
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

// ---------- เมนูซ้าย · หน้าว่าง ----------
await c.evaluate(`[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('เสียงและซับ')).click()`);
await waitFor("return !!document.querySelector('[data-av-page]')");
const empty = await q("return document.querySelector('[data-av-page]').innerText");
const navs = await q("return [...document.querySelectorAll('.side .nav')].map(b => b.innerText.trim()).join('|')");
check("เมนูซ้ายมีหน้าเสียงและซับต่อจากใส่โปสเตอร์ · หน้าว่างบอกให้ลากไฟล์หนัง", empty.includes("ลากไฟล์หนังมาวางตรงนี้") && empty.includes("แล้วลากไฟล์เสียงหรือซับตามมาวางได้เลย") && navs.includes("ใส่โปสเตอร์|เสียงและซับ"), navs);
await shot("01-หน้าว่าง.png", ".main");

// ---------- ลากหนังกับเสียงซับมาพร้อมกัน ----------
await drop([join(AV, "ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3"), MOVIE, join(AV, "ดาวตก (2024).th.srt"), join(AV, "ดาวตก (2024).tis620.th.srt"), join(AV, "ดาวตก (2024).en.vtt")]);
await waitFor("return document.querySelectorAll('.trk:not(.head)').length >= 6", 30000);
await sleep(600);
const rows = await q("return [...document.querySelectorAll('.trk:not(.head)')].map(r => r.innerText.replace(/\\s+/g, ' '))");
check("ไม่มีแถบแจ้งค้างบนจอหลังเพิ่มไฟล์ (ข้อความแจ้งอยู่ที่ป้ายในแถว)", (await q("return document.querySelectorAll('.toast').length")) === 0);
check("ลากหนังกับเสียงซับมาพร้อมกัน โปรแกรมแยกเองว่าไฟล์ไหนเป็นหนัง · ได้ 6 แถว", rows.length === 6 && rows[0].includes("H.264") && rows[1].includes("AAC") && rows[2].includes("AC-3") && rows[2].includes("เพิ่มใหม่"), rows.map((r) => r.slice(0, 40)).join(" | "));
const d2 = await q(`return ${row(2)}.querySelector('.avnum').value`);
check("พากย์ไทย ดีเลย์ −120 จากชื่อไฟล์ ขึ้นป้าย · ภาษาไทยจากชื่อ · 5.1", rows[2]?.includes("ดีเลย์จากชื่อไฟล์") && rows[2].includes("ไทย") && rows[2].includes("5.1") && d2 === "-120", d2);
check("ซับ TIS-620 ขึ้นป้าย · ซับ VTT ขึ้นป้าย แปลงเป็น SRT", rows[4]?.includes("TIS-620") && rows[5]?.includes("แปลงเป็น SRT"), `${rows[4]?.slice(0, 60)} | ${rows[5]?.slice(0, 60)}`);
const chips = await q("return [...document.querySelectorAll('.trk:not(.head) .ft')].map(f => f.innerText + ':' + getComputedStyle(f).backgroundColor)");
check("คอลัมน์ชนิด H.264 AAC AC-3 SRT SRT VTT สีต่างกันตามชนิด", new Set(chips.map((x) => x.split(":")[1])).size >= 4 && chips.map((x) => x.split(":")[0]).join(" ") === "H.264 AAC AC-3 SRT SRT VTT", chips.join(" | "));
await shot("02-ตารางแทร็ก.png", ".main");

// ---------- ภาษา ----------
await c.evaluate(`${row(3)}.querySelector('[data-lang-btn]').click()`);
await waitFor("return !!document.querySelector('[data-lang-pop]')");
const pop = await q("const r = document.querySelector('[data-lang-pop]').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, first: [...document.querySelectorAll('[data-lang-pop] .lrow')].slice(0, 2).map(x => x.innerText.split('\\n')[0]).join(','), n: document.querySelectorAll('[data-lang-pop] .lrow').length }");
check("รายการภาษา ไทย อังกฤษ บนสุด ครบราวพันภาษา ไม่ล้นขอบจอ", pop.first === "ไทย,อังกฤษ" && pop.n > 900 && pop.bottom <= pop.h && pop.top >= 34, JSON.stringify(pop));
await shot("03-รายการภาษา.png", ".main");
await c.type("jpn");
await sleep(250);
const jp = await q("return [...document.querySelectorAll('[data-lang-pop] .lrow')].map(x => x.innerText.split('\\n')[0])");
check("พิมพ์ค้นรหัส jpn เจอญี่ปุ่น", jp[0] === "ญี่ปุ่น", jp.slice(0, 3).join(","));
await c.key("Escape");
await sleep(200);
await c.evaluate(`${row(3)}.querySelector('[data-lang-btn]').click()`);
await waitFor("return !!document.querySelector('[data-lang-pop]')");
await c.type("ำืเ");
await sleep(250);
const sw = await q("return [...document.querySelectorAll('[data-lang-pop] .lrow')].map(x => x.innerText.split('\\n')[0])");
check("ลืมสลับแป้นพิมพ์ ำืเ (คือ eng) ก็หาเจออังกฤษ", sw[0] === "อังกฤษ", sw.slice(0, 3).join(","));
await c.key("Escape");
await sleep(200);

// ---------- ตั้งหลัก ดีเลย์ ----------
await c.evaluate(`${row(2)}.querySelector('[data-main]').click()`);
await c.evaluate(`${row(3)}.querySelector('[data-main]').click()`);
await c.evaluate(`${row(3)}.click()`);
for (let i = 0; i < 5; i++) await c.evaluate(`[...${row(3)}.querySelectorAll('.delay button')][1].click()`);
await sleep(200);
const d3 = await q(`return ${row(3)}.querySelector('.avnum').value`);
check("ปุ่ม + ดีเลย์ทีละ 100 ms กด 5 ครั้งได้ +500", d3 === "+500", d3);
const mains = await q("return [...document.querySelectorAll('.trk:not(.head) [data-main]')].map(r => r.getAttribute('aria-checked'))");
check("ตั้งพากย์ไทยเป็นเสียงหลัก ซับไทยเป็นซับหลัก · หลักมีแทร็กเดียวต่อชนิด", JSON.stringify(mains) === JSON.stringify(["false", "true", "true", "false", "false"]), mains.join(","));
const detail = await q("return document.querySelector('[data-track-detail]')?.innerText ?? ''");
check("การ์ดตั้งค่าแทร็กของแถวที่กด ภาษา ชื่อ ซับหลัก ดีเลย์", detail.includes("ตั้งค่าแทร็ก") && detail.includes("ตั้งเป็นซับหลัก") && detail.includes("ติดลบ = ซับมาเร็วขึ้น"), detail.replace(/\s+/g, " ").slice(0, 80));
await shot("04-ตั้งค่าแทร็ก.png", "[data-track-detail]", 6);

// ---------- เอาออก เลื่อนลำดับ ----------
await c.evaluate(`${row(1)}.querySelector('[data-remove]').click()`);
await sleep(150);
const out1 = await q(`return ${row(1)}.className + ' · ' + document.querySelector('[data-counts]').innerText`);
check("เอาเสียงเดิมออก แถวจาง ขีดฆ่า นับว่าเอาออก 1", out1.includes("out") && out1.includes("เอาออก 1"), out1);
await c.evaluate(`${row(1)}.querySelector('[data-undo]').click()`);
await c.evaluate(`${row(2)}.querySelectorAll('.mv button')[0].click()`);
await sleep(150);
const ord = await q("return [...document.querySelectorAll('.trk:not(.head) .ft')].map(f => f.innerText).join(' ')");
check("เอากลับได้ · เลื่อนพากย์ไทยขึ้นเหนือเสียงเดิม", ord === "H.264 AC-3 AAC SRT SRT VTT", ord);

// ---------- ปก ----------
await c.evaluate(`window.__avDrop(${JSON.stringify([join(IMG, "poster.jpg")])}, 0, 0)`);
await waitFor("return !!document.querySelector('[data-use]')", 20000);
await sleep(900);
await c.evaluate("document.querySelector('[data-use]').click()");
await waitFor("return document.querySelector('[data-slot=cover]').innerText.includes('เพิ่มใหม่')", 20000);
await sleep(300);
const slot = await q("return document.querySelector('[data-slot=cover]').innerText.replace(/\\s+/g, ' ')");
check("ลากรูปแนวตั้งมาวาง หน้าครอปขึ้น กดใช้รูปนี้ ช่องปกตั้งเป็นรูปใหม่", slot.includes("cover.jpg") && slot.includes("เพิ่มใหม่") && slot.includes("ครอปใหม่"), slot);
await shot("05-ปก.png", "[data-slot=cover]", 6);

// ---------- ไปหน้าอื่นแล้วกลับมา งานยังอยู่ ----------
await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('ตั้งค่า')).click()");
await sleep(500);
await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('เสียงและซับ')).click()");
await waitFor("return document.querySelectorAll('.trk:not(.head)').length > 0");
const back = await q("return [...document.querySelectorAll('.trk:not(.head) .ft')].map(f => f.innerText).join(' ') + ' · ' + document.querySelector('[data-slot=cover]').innerText.includes('เพิ่มใหม่') + ' · ' + document.querySelectorAll('.trk:not(.head)')[3].querySelector('.avnum').value");
check("ไปหน้าตั้งค่าแล้วกลับมา แทร็ก ลำดับ ดีเลย์ ปกใหม่ ยังอยู่ครบ", back === "H.264 AC-3 AAC SRT SRT VTT · true · +500", back);

// ---------- ตัวช่วยหาดีเลย์ (ขั้น 5) · พากย์ไทยที่เลื่อนจริง 120 ms · เสียง PAL 25 fps ----------
const clickTextAny = (sel, text) => c.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.innerText.trim() === ${JSON.stringify(text)}).click()`);
const findRow = (text) => `[...document.querySelectorAll('.trk:not(.head)')].find(r => r.innerText.includes(${JSON.stringify(text)}))`;
await c.evaluate(`${findRow("พากย์ไทย DELAY")}.click()`);
await waitFor("return !!document.querySelector('[data-find-delay]')", 8000);
await c.evaluate("document.querySelector('[data-find-delay]').click()");
await waitFor("return !!document.querySelector('[data-delay-dialog]')", 8000);
const gotRes = await waitFor("const r = document.querySelector('[data-delay-res]')?.dataset.delayRes; return r && r !== 'finding'", 60000);
await waitFor("return !!document.querySelector('[data-lane=b]')", 20000);
await sleep(400);
const dres = await q("return document.querySelector('[data-delay-res]')?.dataset.delayRes + ' · ' + document.querySelector('[data-delay-res]')?.innerText.replace(/\\s+/g, ' ')");
const dnum = Number((dres.match(/โปรแกรมหาให้ ([−+]?[\d,]+) ms/) || [])[1]?.replace("−", "-").replace(",", ""));
check("กดหาค่าดีเลย์ของพากย์ไทย (เลื่อนจริง 120 ms ชื่อไฟล์ DELAY -120ms) โปรแกรมหาได้ −120 ±10 ms ตรงกับค่าในชื่อไฟล์ เทียบ 3 ช่วงได้ค่าเดียวกัน ไม่ต้องตั้งความเร็ว",
  gotRes && dres.startsWith("ok") && Math.abs(dnum + 120) <= 10 && dres.includes("ตรงกับค่าในชื่อไฟล์") && dres.includes("ไม่ต้องตั้งความเร็วเสียง"), dres.slice(0, 200));
const lanes = await q("return [...document.querySelectorAll('[data-lane]')].map(cv => { const g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 2] > d[i] + 40 || d[i] < 230) n++; return n; })");
check("คลื่นเสียงเดิมกับเสียงใหม่วาดซ้อนกันสองเลน มีคลื่นจริงทั้งคู่", lanes.length === 2 && lanes.every((n) => n > 2000), lanes.join(","));
// ปุ่ม + สามครั้ง ดีเลย์บนจอเลื่อนตาม บอกว่าต่างจากที่โปรแกรมหาได้ · พิมพ์กลับ
for (let i = 0; i < 3; i++) await c.evaluate("document.querySelector('[data-delay-dialog] [aria-label=\"เพิ่มดีเลย์ 10 ms\"]').click()");
await sleep(250);
const moved = await q("return document.querySelector('[data-dv]').innerText + ' · ' + (document.querySelector('[data-delay-moved]')?.innerText ?? '')");
check("กดปุ่ม + สามครั้ง ดีเลย์บนเลนเสียงใหม่เปลี่ยนตาม บอกว่าต่างจากค่าที่โปรแกรมหาได้", moved.startsWith(String(dnum + 30).replace("-", "−")) && moved.includes("ต่างจากที่โปรแกรมหาได้"), moved.slice(0, 120));
await c.evaluate(`(() => { const i = document.querySelector('[data-delay-num]'); i.focus(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(String(dnum))}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(80);
await c.evaluate("document.querySelector('[data-delay-num]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))");
await sleep(250);
await shot("15-ตัวช่วยหาดีเลย์.png", "[role=dialog]", 8);
// ลองฟัง 20 วินาที · รุ่นทดสอบทำไฟล์แต่ไม่เปิดโปรแกรมเล่น (ไม่ให้เด้งขึ้นจอ)
await c.evaluate("window.__delayDry = true; document.querySelector('[data-delay-play]').click()");
await waitFor("return !!document.querySelector('[data-delay-preview]')", 60000);
const pfile = await q("return document.querySelector('[data-delay-preview]')?.dataset.file ?? ''");
const pj = pfile ? ident(pfile) : {};
const pt = (pj.tracks ?? []).map((t) => t.type + ":" + t.codec).join(",");
const pdur = (pj.container?.properties?.duration ?? 0) / 1e9;
check("ลองฟัง 20 วินาที ทำไฟล์ชั่วคราวในโฟลเดอร์ของโปรแกรม ภาพจากหนัง เสียงพากย์ไทยใส่ดีเลย์ ยาวราว 20 วินาที · ไฟล์หนังไม่ถูกแก้", pfile.includes("delay-preview-") && pt.startsWith("video:") && pt.includes("audio:AC-3") && !pt.includes("AAC") && pdur > 18 && pdur < 23 && sha(MOVIE) === h0, `${pt} · ${pdur.toFixed(1)} วินาที`);
await c.evaluate("document.querySelector('[data-delay-use]').click()");
await sleep(300);
const rowDelay = await q(`return ${findRow("พากย์ไทย DELAY")}.querySelector('.avnum').value`);
check("กดใช้ค่านี้ ช่องดีเลย์ของแถวพากย์ไทยเป็นค่าที่หาได้", rowDelay === String(dnum).replace("−", "-") || Number(rowDelay.replace("−", "-")) === dnum, rowDelay);
// เสียง PAL 25 fps · เทียบตรง ๆ ไม่ติด ยืดแล้วตรง เสนอคู่ 25 → 23.976 · ปุ่มไปตั้งในแผงตั้งค่าเสียง
await drop([join(AV, "ดาวตก (2024) PAL 25fps.ac3")]);
await waitFor(`return !!${findRow("PAL 25fps")}`, 20000);
await c.evaluate(`${findRow("PAL 25fps")}.click()`);
await waitFor("return !!document.querySelector('[data-find-delay]')", 8000);
await c.evaluate("document.querySelector('[data-find-delay]').click()");
const gotPal = await waitFor("const r = document.querySelector('[data-delay-res]')?.dataset.delayRes; return r && r !== 'finding'", 60000);
await waitFor("return !!document.querySelector('[data-lane=b]')", 20000);
await sleep(400);
const pres = await q("return document.querySelector('[data-delay-res]')?.dataset.delayRes + ' · ' + document.querySelector('[data-delay-res]')?.innerText.replace(/\\s+/g, ' ')");
check("เสียง PAL 25 fps โปรแกรมบอกว่าเร็วไม่เท่าหนัง เสนอคู่ความเร็ว 25 → 23.976 บอกว่าเทียบตรง ๆ ตรงกันน้อย", gotPal && pres.startsWith("speed") && pres.includes("25 → 23.976") && pres.includes("แผ่นยุโรป PAL"), pres.slice(0, 200));
await shot("16-ตัวช่วยหาดีเลย์-PAL.png", "[role=dialog]", 8);
await c.evaluate("document.querySelector('[data-delay-speed]').click()");
await waitFor("return !!document.querySelector('[data-codec-panel]')", 15000);
await sleep(400);
const spd = await q("return [...document.querySelectorAll('[data-codec-panel] [data-extra] .dd')].map(d => d.innerText).join('|')");
check("กดปุ่มตั้งความเร็วในตัวช่วยหาดีเลย์ แผงตั้งค่าเสียงเปิดพร้อมความเร็ว 25 → 23.976", spd.includes("25 → 23.976"), spd);
await clickTextAny("[role=dialog] button", "ยกเลิก");
await sleep(300);
await c.evaluate(`${findRow("PAL 25fps")}.querySelector('[data-remove]').click()`);
await sleep(300);
check("เอาไฟล์ PAL ที่ลากมาทดสอบออกแล้ว แถวกลับเป็นเหมือนเดิม", !(await q(`return !!${findRow("PAL 25fps")}`)) && !(await q("return !!document.querySelector('[data-codec-panel]')")));

// ---------- ตัวดูซับ (ขั้น 6) · ซับตัวหนังสือ แบบ Aegisub แบบอ่านยาว แบบ notepad · ดีเลย์ +500 ของซับไทยเลื่อนเวลาที่แสดง ----------
const openSub = async (text) => { await c.evaluate(`${findRow(text)}.querySelector('[data-subview]').click()`); await waitFor("return !!document.querySelector('[data-subviewer]')", 8000); };
const closeDlg = async () => { await clickTextAny("[role=dialog] .acts button", "ปิด"); await sleep(250); };
await openSub("(2024).th.srt");
await waitFor("return document.querySelectorAll('[data-sub-table] tbody tr').length > 0", 15000);
const subRows = await q("return [...document.querySelectorAll('[data-sub-table] tbody tr')].map(r => [...r.children].map(td => td.innerText).join('|'))");
const subHead = await q("return document.querySelector('[data-subviewer] .small').innerText");
check("กดรูปตาในแถวซับไทย เปิดแบบ Aegisub ตาราง 3 บรรทัด เวลาเลื่อนตามดีเลย์ +500 (1.00 เป็น 1.50) ช่องตัว/วิ ข้อความภาษาไทยครบ",
  subRows.length === 3 && subRows[0].startsWith("1|0:00:01.50|0:00:04.50|3.00|") && subRows[0].includes("ซับไตเติลภาษาไทย") && subHead.includes("ดีเลย์ +500 ms") && subHead.includes("3 บรรทัด"), subRows[0] + " · " + subHead);
const frameOk = await waitFor("const i = document.querySelector('[data-vframe] img'); return i && i.complete && i.naturalWidth > 0", 20000);
const audOk = await waitFor("return !!document.querySelector('[data-aud]')", 20000);
await c.evaluate("document.querySelectorAll('[data-sub-table] tbody tr')[1].click()");
await waitFor("return document.querySelector('[data-vframe] .vsub')?.innerText.includes('ไฟล์ทดสอบ')", 8000);
const vsub = await q("return document.querySelector('[data-vframe] .vsub').innerText + ' · ' + document.querySelector('[data-vframe] .vtime').innerText + ' · ' + document.querySelectorAll('[data-sub-table] tr.on').length");
check("ภาพหนังตรงเวลานั้นขึ้น คลื่นเสียงช่วงนั้นขึ้น · กดบรรทัด 2 ซับที่ทับภาพกับเวลาเปลี่ยนเป็นบรรทัด 2", frameOk && audOk && vsub.startsWith("ไฟล์ทดสอบของโปรแกรมชั้นหนัง") && vsub.includes("0:00:05.50 · 1"), vsub);
await sleep(800);
await shot("17-ดูซับ-Aegisub.png", "[role=dialog]", 8);
const findH = await q("return [...new Set([...document.querySelectorAll('[data-sub-q], [data-sub-q] ~ button')].map(e => Math.round(e.getBoundingClientRect().height)))]");
check("แถวค้นในซับ ช่องค้นกับปุ่มก่อนหน้า ถัดไป สูงเท่ากัน", findH.length === 1, findH.join(","));
await clickTextAny("[data-subviewer] .seg button", "ความถี่");
const specOk = await waitFor("const cv = document.querySelector('[data-aud]'); if (!cv) return false; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let light = 0, all = 0; for (let i = 0; i < d.length; i += 16) { all++; if (d[i + 1] > 235) light++; } return all > 1000 && light / all < 0.1", 20000);
const playBtn = await q("return document.querySelector('[data-sub-play]')?.innerText ?? ''");
check("แบบ Aegisub กดความถี่ คลื่นเปลี่ยนเป็นภาพความถี่ (คำสั่งเดียวกับหน้ากราฟเสียง) · มีปุ่มเปิดเล่นที่เวลาบรรทัด (ไม่กด เพราะจะเปิดโปรแกรมเล่นขึ้นจอ)", specOk && playBtn.startsWith("เปิดเล่นที่ 0:00:05"), playBtn);
await sleep(300);
await shot("17-ดูซับ-ความถี่.png", "[data-subviewer] .aegtop", 8);
await clickTextAny("[data-subviewer] .seg button, [role=dialog] .seg button", "แบบอ่านยาว");
await waitFor("return !!document.querySelector('[data-long-view]')", 5000);
await c.evaluate(`(() => { const i = document.querySelector('[data-sub-q]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'ไฟล์'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(300);
const longHit = await q("return document.querySelector('[data-sub-hits]').innerText + ' · ' + document.querySelectorAll('[data-long-view] mark').length");
check("แบบอ่านยาว ค้นคำว่า ไฟล์ เจอ 1 ที่ ไฮไลต์คำที่เจอ", longHit.startsWith("เจอ 1 ที่") && longHit.endsWith("· 1"), longHit);
await clickTextAny("[role=dialog] .seg button", "แบบ notepad");
await waitFor("return !!document.querySelector('[data-notepad-view]')", 5000);
await c.evaluate(`(() => { const i = document.querySelector('[data-sub-q]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '-->'); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
await sleep(300);
const pad = await q("return document.querySelectorAll('[data-notepad-view] .npl').length + ' · ' + document.querySelector('[data-notepad-view] .npl .ln').innerText + ' · ' + document.querySelector('[data-sub-hits]').innerText + ' · ' + document.querySelector('.npst').innerText.replace(/\\s+/g, ' ')");
check("แบบ notepad เปิดไฟล์จริงมีเลขบรรทัด ค้น --> เจอ 3 ที่ (บรรทัดเวลาของ 3 บรรทัดซับ) บอก SRT UTF-8", Number(pad.split(" · ")[0]) >= 11 && pad.includes("· 1 ·") && pad.includes("เจอ 3 ที่") && pad.includes("SRT") && pad.includes("UTF-8"), pad);
await shot("18-ดูซับ-notepad.png", "[role=dialog]", 8);
await closeDlg();
// ซับไทยเข้ารหัสแบบเก่า อ่านได้เหมือนซับ UTF-8
await openSub("tis620");
await waitFor("return document.querySelectorAll('[data-sub-table] tbody tr').length > 0", 15000);
const tisRow = await q("return document.querySelector('[data-sub-table] tbody tr td:last-child').innerText");
await clickTextAny("[role=dialog] .seg button", "แบบ notepad");
await waitFor("return !!document.querySelector('.npst')", 5000);
const tisCs = await q("return document.querySelector('.npst').innerText");
check("ซับไทย TIS-620 อ่านได้ ข้อความเหมือนซับ UTF-8 บอกว่าเป็น TIS-620", tisRow.includes("ซับไตเติลภาษาไทย") && tisCs.includes("TIS-620"), tisRow + " · " + tisCs.replace(/\s+/g, " "));
await closeDlg();
// ซับ VTT
await openSub(".en.vtt");
await waitFor("return document.querySelectorAll('[data-sub-table] tbody tr').length > 0", 15000);
const vttRows = await q("return document.querySelectorAll('[data-sub-table] tbody tr').length + ' · ' + document.querySelector('[data-sub-table] tbody tr td:last-child').innerText");
check("ซับ VTT เปิดได้ 2 บรรทัด", vttRows.startsWith("2 · "), vttRows);
await closeDlg();

// ---------- แผงตั้งค่าเสียงแบบง่าย (ขั้น 4) · เสียงอังกฤษ AAC ในหนัง แปลงเป็น Opus เพิ่มคู่ ----------
await c.evaluate(`${row(2)}.querySelector('[data-conv]').click()`);
await waitFor("return !!document.querySelector('[data-codec-panel]') && document.querySelector('[data-cmd]').innerText.includes('opusenc')", 15000);
const cmd1 = await q("return document.querySelector('[data-cmd]').innerText");
check("กดช่องแปลง แผงตั้งค่าเสียงขึ้น ค่าตั้งต้น Opus ตัวต้นฉบับ opusenc คำสั่งที่จะรันมาจากฝั่ง Rust", cmd1.includes("ffmpeg -hide_banner") && cmd1.includes("opusenc --quiet --ignorelength --bitrate 384"), cmd1.replace(/\s+/g, " ").slice(0, 160));
await c.evaluate("document.querySelector('[data-preset=\"1\"]').click()");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('--bitrate 160')", 8000);
const panelText = await q("return document.querySelector('[data-codec-panel]').innerText");
check("เลือกชุดเพลงคุณภาพดี คำสั่งเปลี่ยนเป็น 160 kbps · บอกขนาดทั้งแทร็ก · เตือนแปลงเสียคุณภาพซ้อน · เพิ่มคู่เป็นค่าตั้งต้น",
  panelText.includes("ทั้งแทร็กราว") && panelText.includes("แปลงแบบเสียคุณภาพซ้อน AAC เป็น Opus") && panelText.includes("แทร็กใหม่ชื่อ English Opus ต่อท้ายแทร็กเดิม"), panelText.replace(/\s+/g, " ").slice(0, 200));
// ความเร็วเสียง Gain ความดังมาตรฐาน · คำสั่งต้องมีตัวกรองตามที่ตั้ง แล้วตั้งกลับ ไม่ให้กระทบการรวมข้างล่าง
const pickDd = async (label, text) => {
  await c.evaluate(`[...document.querySelectorAll('[data-codec-panel] .dd')].find(b => b.getAttribute('aria-label').startsWith(${JSON.stringify(label)})).click()`);
  await sleep(200);
  await c.evaluate(`[...document.querySelectorAll('[data-codec-panel] [role=option]')].find(o => o.innerText.startsWith(${JSON.stringify(text)})).click()`);
  await sleep(200);
};
await pickDd("ความเร็วเสียง", "25 → 23.976");
for (let i = 0; i < 3; i++) await c.evaluate("document.querySelector('[data-codec-panel] [aria-label=\"ลดความดัง 1 dB\"]').click()");
await c.evaluate("[...document.querySelectorAll('[data-codec-panel] [data-extra] .seg button')].find(b => b.innerText.startsWith('EBU')).click()");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('loudnorm')", 8000);
const cmd2 = await q("return document.querySelector('[data-cmd]').innerText.replace(/\\s+/g, ' ')");
check("ตั้งความเร็ว 25 → 23.976 Gain −3 dB ความดังมาตรฐาน คำสั่งมี rubberband=tempo=0.959040,volume=-3dB,loudnorm", cmd2.includes('-af "rubberband=tempo=0.959040,volume=-3dB,loudnorm=I=-23:TP=-1"'), cmd2.slice(0, 220));
await shot("11-แผงตั้งค่าเสียง-ความเร็ว.png", "[data-extra]", 8);
const extraH = await q("return [...new Set([...document.querySelectorAll('[data-extra] .dd, [data-extra] .delay button, [data-extra] .seg button')].map(e => Math.round(e.getBoundingClientRect().height)))]");
check("แถวความเร็ว Gain ความดังมาตรฐาน ช่องเลือก ปุ่ม − + ปุ่มเลือก สูงเท่ากันทุกตัว (form-input ข้อ ⑥)", extraH.length === 1, extraH.join(","));
await pickDd("ความเร็วเสียง", "ไม่เปลี่ยน");
for (let i = 0; i < 3; i++) await c.evaluate("document.querySelector('[data-codec-panel] [aria-label=\"เพิ่มความดัง 1 dB\"]').click()");
await c.evaluate("[...document.querySelectorAll('[data-codec-panel] [data-extra] .seg button')].find(b => b.innerText === 'Off').click()");
await waitFor("return !document.querySelector('[data-cmd]').innerText.includes('-af')", 8000);
await shot("10-แผงตั้งค่าเสียง.png", "[role=dialog]", 8);

// ---------- แผงตั้งค่าเสียงแบบขั้นสูง (ขั้น 4) · การ์ดละช่อง ⓘ ทุกช่อง ตัวย่อมีคำเต็ม แถบเลื่อนเป็นขั้น ช่องพิมพ์ค่าเอง ขนาดที่คาด ----------
const card = (k) => `document.querySelector('[data-codec-panel] [data-card="${k}"]')`;
const cmdNow = () => q("return document.querySelector('[data-cmd]').innerText.replace(/\\s+/g, ' ')");
const clickText = (sel, text) => c.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.innerText.trim() === ${JSON.stringify(text)}).click()`);
await clickText("[data-codec-panel] .seg button", "ขั้นสูง");
await waitFor("return !!document.querySelector('[data-cards]')", 8000);
await sleep(300);
const advCards = await q("return [...document.querySelectorAll('[data-codec-panel] .acard')].map(a => a.dataset.card)");
const infoInCards = await q("return [...document.querySelectorAll('[data-codec-panel] .acard')].every(a => a.querySelector('.ach .infob'))");
const br0 = await q(`return ${card("bitrate")}.querySelector('[data-vin]').value`);
check("กดขั้นสูง Opus มีการ์ด Bitrate · Bitrate mode · Complexity · Frame size · Tuning · Channels · ใช้กับทุกชนิด Gain · Loudness · ความเร็ว · ทุกการ์ดมีปุ่ม ⓘ หัวการ์ด · ค่าจากชุดที่เลือกในแบบง่ายไม่หาย (160)",
  advCards.join(",") === "bitrate,mode,comp,framesize,tune,channels,gain,loud,speed" && infoInCards && br0 === "160", `${advCards.join(",")} · ค่า ${br0}`);
const modeText = await q(`return ${card("mode")}.innerText.replace(/\\s+/g, ' ')`);
const brText = await q(`return ${card("bitrate")}.innerText.replace(/\\s+/g, ' ')`);
check("ตัวย่อมีคำเต็มครั้งแรกที่เจอในการ์ด VBR (Variable Bitrate) ครั้งเดียว · CBR (Constant Bitrate) · kbps (kilobits per second)",
  (modeText.match(/\(Variable Bitrate\)/g) || []).length === 1 && modeText.includes("CBR (Constant Bitrate)") && brText.includes("kbps (kilobits per second)"), modeText.slice(0, 140));
// แถบเลื่อน ลูกศรขวาหนึ่งขั้น 160 → 192 · ขนาดที่คาดกับคำสั่งเปลี่ยนตาม
const sz0 = await q(`return ${card("bitrate")}.querySelector('[data-sz]').innerText`);
await c.evaluate(`${card("bitrate")}.querySelector('.range').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('--bitrate 192')", 8000);
const sz1 = await q(`return ${card("bitrate")}.querySelector('[data-sz]').innerText + ' · ' + ${card("bitrate")}.querySelector('[data-vin]').value`);
check("เลื่อนแถบ Bitrate หนึ่งขั้น 160 เป็น 192 ช่องค่าเปลี่ยนตาม ขนาดที่คาดใหญ่ขึ้น คำสั่งเป็น --bitrate 192", sz1.endsWith("· 192") && sz0 !== sz1.split(" · ")[0], `${sz0} → ${sz1}`);
// พิมพ์ค่าเองที่ไม่อยู่ในขั้น Opus รับได้ทุกค่า 6–512 · พิมพ์เกินช่วงปัดเข้าช่วง
const typeIn = async (k, v) => {
  await c.evaluate(`(() => { const i = ${card(k)}.querySelector('[data-vin]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await sleep(80);
  await c.evaluate(`${card(k)}.querySelector('[data-vin]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))`);
  await sleep(250);
};
await typeIn("bitrate", "200");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('--bitrate 200')", 8000);
const c200 = await cmdNow();
await typeIn("bitrate", "900");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('--bitrate 512')", 8000);
const c512 = await cmdNow();
check("พิมพ์ค่าเอง 200 ได้ --bitrate 200 · พิมพ์ 900 เกินช่วง ปัดเป็น 512", c200.includes("--bitrate 200") && c512.includes("--bitrate 512"), c512.slice(c512.indexOf("opusenc"), c512.indexOf("opusenc") + 60));
await typeIn("bitrate", "160");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('--bitrate 160')", 8000);
// ปุ่มเลือกในการ์ด Tuning เปลี่ยนคำสั่ง
await clickText(`[data-codec-panel] [data-card="tune"] .seg button`, "Music");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('--music')", 8000);
check("กด Tuning Music คำสั่งมี --music", (await cmdNow()).includes("--music"));
await clickText(`[data-codec-panel] [data-card="tune"] .seg button`, "Auto");
await sleep(200);
await shot("12-แผงขั้นสูง-Opus.png", "[role=dialog]", 8);
const advH = await q("return { ctl: [...new Set([...document.querySelectorAll('[data-codec-panel] .acard .dd, [data-codec-panel] .acard .seg button')].map(e => Math.round(e.getBoundingClientRect().height)))], vbox: [...new Set([...document.querySelectorAll('[data-codec-panel] .vbox')].map(e => Math.round(e.getBoundingClientRect().height)))], info: [...new Set([...document.querySelectorAll('[data-codec-panel] .infob')].map(e => Math.round(e.getBoundingClientRect().height)))] }");
check("การ์ดขั้นสูง ช่องเลือกกับปุ่มเลือกสูง 30 เท่ากันทุกการ์ด · ช่องพิมพ์ค่า 32 · ปุ่ม ⓘ 26 ทุกตัว", advH.ctl.join() === "30" && advH.vbox.join() === "32" && advH.info.join() === "26", JSON.stringify(advH));
const plainDot = await q("return [...document.querySelectorAll('[data-codec-panel] .acard .small, [data-codec-panel] .asz')].filter(e => e.textContent.includes(' · ')).map(e => e.textContent.slice(0, 40))");
check("จุดคั่นในการ์ดติดคำข้างหน้าทุกที่ ไม่ขึ้นต้นบรรทัดใหม่", plainDot.length === 0, plainDot.join(" | "));
const head = await q("return document.querySelector('[data-codec-panel] .small').innerText");
check("หัวแผงไม่บอกความลึกบิตของต้นทางที่เสียคุณภาพ (AAC ถอดเป็นทศนิยม 32 บิต ไม่ใช่ความลึกบิตจริง)", !head.includes("bit"), head);

// ปุ่ม ⓘ · กล่องคำอธิบายพอดีจอ ไม่ทับแถบบน ไม่จมขอบล่าง · Esc ปิดเฉพาะกล่อง แผงยังอยู่
const tipBox = "return (() => { const t = document.querySelector('.infotip'); if (!t) return null; const r = t.getBoundingClientRect(), top = document.querySelector('header')?.getBoundingClientRect().bottom ?? 0; return { text: t.innerText.replace(/\\s+/g, ' '), top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), head: Math.round(top), h: innerHeight, w: innerWidth, side: t.dataset.side, vis: getComputedStyle(t).visibility }; })()";
await c.evaluate(`${card("bitrate")}.querySelector('.infob').click()`);
await waitFor("const t = document.querySelector('.infotip'); return t && getComputedStyle(t).visibility === 'visible'", 5000);
await sleep(200);
const tb = await q(tipBox);
check("กด ⓘ ของ Bitrate กล่องคำอธิบายขึ้น มีคืออะไร ปรับสูงปรับต่ำ ข้อดี ข้อเสีย แนะนำ · ตัวย่อในกล่องมีคำเต็ม · อยู่ในจอทั้งสี่ด้าน ใต้แถบบน",
  tb && tb.text.includes("จำนวนข้อมูลเสียงต่อวินาที") && tb.text.includes("ข้อดี") && tb.text.includes("ข้อเสีย") && tb.text.includes("แนะนำ") && tb.text.includes("kbps (kilobits per second)")
  && tb.top >= tb.head && tb.bottom <= tb.h && tb.left >= 0 && tb.right <= tb.w, tb ? `บน ${tb.top} ล่าง ${tb.bottom} จอ ${tb.h} แถบบน ${tb.head} ฝั่ง ${tb.side}` : "ไม่ขึ้น");
await c.shot(`${OUT}/13-กล่องคำอธิบาย.png`, ".infotip", 10);
await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(300);
check("กด Esc ปิดเฉพาะกล่องคำอธิบาย แผงตั้งค่าเสียงยังอยู่", (await q("return !document.querySelector('.infotip') && !!document.querySelector('[data-codec-panel]')")));
// ⓘ ของการ์ดล่างสุดในแผง กางแล้วยังอยู่ในจอ
await c.evaluate(`${card("speed")}.querySelector('.infob').scrollIntoView({ block: 'end' })`);
await sleep(200);
await c.evaluate(`${card("speed")}.querySelector('.infob').click()`);
await waitFor("const t = document.querySelector('.infotip'); return t && getComputedStyle(t).visibility === 'visible'", 5000);
await sleep(400);
const tb2 = await q(tipBox);
check("ⓘ ของการ์ดล่างสุด (ความเร็วเสียง) กางแล้วไม่จมขอบล่าง ไม่ทับแถบบน", tb2 && tb2.top >= tb2.head && tb2.bottom <= tb2.h, tb2 ? `บน ${tb2.top} ล่าง ${tb2.bottom} จอ ${tb2.h} ฝั่ง ${tb2.side}` : "ไม่ขึ้น");
// กดที่อื่นปิดกล่อง
await c.evaluate("document.querySelector('[data-codec-panel] .small').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))");
await sleep(200);
check("กดที่อื่นในแผง กล่องคำอธิบายปิด", await q("return !document.querySelector('.infotip')"));
// ดรอปดาวน์ในแผง กด Esc ปิดเฉพาะดรอปดาวน์ แผงยังอยู่
await c.evaluate(`${card("speed")}.querySelector('.dd').click()`);
await sleep(250);
const ddOpen = await q("return document.querySelectorAll('[role=option]').length");
await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(300);
check("เปิดดรอปดาวน์ความเร็วในแผงแล้วกด Esc ปิดเฉพาะดรอปดาวน์ แผงตั้งค่าเสียงยังอยู่", ddOpen > 0 && (await q("return document.querySelectorAll('[role=option]').length === 0 && !!document.querySelector('[data-codec-panel]')")), `ตัวเลือก ${ddOpen}`);

// FLAC การ์ดเปลี่ยนตามชนิด · Block size ลงคำสั่ง · เปลี่ยนเป็น ffmpeg การ์ดที่ ffmpeg ไม่มีหายไป
await clickText("[data-codec-panel] .seg button", "FLAC");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('flac --silent')", 8000);
const flacCards = await q("return [...document.querySelectorAll('[data-codec-panel] [data-cards] .acard')].map(a => a.dataset.card).join(',')");
await c.evaluate(`${card("block")}.querySelector('.dd').click()`);
await sleep(200);
await c.evaluate("[...document.querySelectorAll('[role=option]')].find(o => o.innerText.trim() === '4,608').click()");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('-b 4608')", 8000);
const flacCmd = await cmdNow();
check("เปลี่ยนเป็น FLAC การ์ด Compression level · Threads · Verify · Bit depth · Sample rate · Block size · ไม่มีการ์ดของ Opus ค้าง · เลือก Block size 4,608 คำสั่งมี -b 4608",
  flacCards === "level,threads,verify,bits,rate,block" && flacCmd.includes("-b 4608") && !flacCmd.includes("--bitrate"), `${flacCards} · ${flacCmd.slice(flacCmd.indexOf("flac --"), flacCmd.indexOf("flac --") + 70)}`);
await shot("14-แผงขั้นสูง-FLAC.png", "[data-cards]", 8);
await clickText("[data-codec-panel] .seg button", "ffmpeg 9.0.2");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('-c:a flac')", 8000);
const ffCards = await q("return [...document.querySelectorAll('[data-codec-panel] [data-cards] .acard')].map(a => a.dataset.card).join(',')");
const ffCmd = await cmdNow();
check("ตัวแปลง ffmpeg การ์ด Threads กับ Verify หายไปพร้อมบอกเหตุผล · Block size ยังอยู่ คำสั่ง -frame_size 4608",
  ffCards === "level,bits,rate,block" && ffCmd.includes("-frame_size 4608") && (await q("return document.querySelector('[data-codec-panel]').innerText.includes('ไม่มีบางช่องของตัวต้นฉบับ flac การ์ดที่ไม่มีจึงไม่แสดง')")), `${ffCards}`);
// MP3 โหมด CBR · การ์ด VBR quality หายไป การ์ด Bitrate ขึ้นแทน
await clickText("[data-codec-panel] .seg button", "MP3");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('lame')", 8000);
await clickText(`[data-codec-panel] [data-card="mode"] .seg button`, "CBR");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('--cbr')", 8000);
const mp3Cards = await q("return [...document.querySelectorAll('[data-codec-panel] [data-cards] .acard')].map(a => a.dataset.card).join(',')");
check("MP3 เลือกโหมด CBR การ์ด VBR quality หายไป การ์ด Bitrate ขึ้นแทน คำสั่ง -b 192 --cbr", mp3Cards === "mode,bitrate,stereo,quality,lowpass" && (await cmdNow()).includes("-b 192 --cbr"), mp3Cards);
// ความลึกบิตต้นทาง · คำสั่งเดียวกับที่แผงเรียก ต้นทาง 16 บิตแปลงเป็น FLAC ตามต้นฉบับได้ 16 บิต
const p16 = await inv("encode_preview", { spec: { codec: "flac", encoder: "native", p: { level: 5 } }, srcName: "a.wav", stream: 0, channels: 2, bits: 16 });
const p24 = await inv("encode_preview", { spec: { codec: "flac", encoder: "native", p: { level: 5 } }, srcName: "a.wav", stream: 0, channels: 2, bits: 24 });
check("ต้นทาง 16 บิต FLAC ตามต้นฉบับส่งเสียงดิบ 16 บิต ไม่ใส่ dither · ต้นทาง 24 บิตส่ง 24 บิต (เดิมส่ง 24 บิตเสมอ)", p16.text.includes("pcm_s16le") && !p16.text.includes("dither") && p24.text.includes("pcm_s24le"));
// กลับ Opus แบบง่าย ชุดเพลงคุณภาพดี ให้การรวมข้างล่างได้ Opus 160 เหมือนเดิม
await clickText("[data-codec-panel] .seg button", "Opus");
await clickText("[data-codec-panel] .seg button", "แบบง่าย");
await sleep(200);
await c.evaluate("document.querySelector('[data-preset=\"1\"]').click()");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('--bitrate 160')", 8000);
await c.evaluate("document.querySelector('[data-conv-use]').click()");
await sleep(300);
const convCell = await q(`return ${row(2)}.querySelector('[data-conv]').innerText + ' · ' + ${row(2)}.innerText.includes('แปลง')`);
check("กดใช้ค่านี้ ช่องแปลงขึ้น Opus 160 · เพิ่มคู่ แถวมีป้ายแปลง", convCell.startsWith("Opus 160 · เพิ่มคู่") && convCell.endsWith("true"), convCell);

// ---------- หน้าต่างบอกเรื่อง VTT ก่อนรวม แล้วรวมจริง ----------
await c.evaluate("document.querySelector('[data-start]').click()");
await waitFor("return !!document.querySelector('[data-vtt-dialog]')");
const vd = await q("return document.querySelector('[data-vtt-dialog]')?.closest('[role=dialog]')?.innerText ?? ''");
check("กดรวม มีซับ VTT ขึ้นหน้าต่างบอกก่อนว่าจะแปลง VTT เป็น SRT (พี่กันสั่ง)", vd.includes("ก่อนรวม โปรแกรมจะแปลงซับ VTT เป็น SRT") && vd.includes("ดาวตก (2024).en.vtt") && vd.includes("แปลงแล้วรวมต่อ"), vd.replace(/\s+/g, " ").slice(0, 120));
await shot("06-หน้าต่างแปลงVTT.png", "[role=dialog]", 8);
await c.evaluate("document.querySelector('[data-vtt-ok]').click()");
const okRun = await waitFor("const r = document.querySelector('[data-run]')?.dataset.run; return r === 'done' || r === 'failed'", 120000);
await sleep(400);
const runText = await q("return document.querySelector('[data-run]')?.innerText ?? ''");
check("รวมเสร็จ ไฟล์ใหม่ตรวจผ่าน ภาพ 1 เสียง 3 (Opus ที่แปลงเพิ่มคู่) ซับ 3 · ไฟล์เดิมย้ายไปไฟล์เดิม", okRun && runText.includes("รวมเสร็จ ไฟล์ใหม่ตรวจผ่าน") && runText.includes("ภาพ 1 · เสียง 3 · ซับ 3") && runText.includes("ไฟล์เดิม"), runText.replace(/\s+/g, " ").slice(0, 220));
await shot("07-รวมเสร็จ.png", ".main");
const j = existsSync(MOVIE) ? ident(MOVIE) : { tracks: [], attachments: [] };
const got = (j.tracks ?? []).map((t) => `${t.codec}|${t.properties.language}|${t.properties.default_track ? 1 : 0}`);
check("ไฟล์ใหม่ ภาพ พากย์ไทยหลัก AAC Opus ที่แปลงเพิ่มคู่ ซับไทยหลัก ซับไทยเก่า ซับอังกฤษ SRT · มีปก cover.jpg", got[1] === "AC-3|tha|1" && got[2] === "AAC|eng|0" && got[3] === "Opus|eng|0" && got[4] === "SubRip/SRT|tha|1" && got[6] === "SubRip/SRT|eng|0" && (j.attachments ?? []).some((a) => a.file_name === "cover.jpg"), got.join(" · "));
check("ไฟล์เดิม hash เท่าก่อนรวม", existsSync(join(DIR, "ไฟล์เดิม", "ดาวตก (2024).mkv")) && sha(join(DIR, "ไฟล์เดิม", "ดาวตก (2024).mkv")) === h0);
check("ไม่มีไฟล์ชั่วคราว .partial ค้าง", readdirSync(DIR).every((f) => !f.endsWith(".partial")));

// ---------- ปุ่มเสียงและซับในแผงขวาของชั้นวาง ----------
await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('ชั้นวางหนัง')).click()");
await inv("scan_library");
await sleep(1500);
await waitFor("return !!document.querySelector('.book[data-movie=\"ดาวตก (2024)\"]')", 15000);
await c.click('.book[data-movie="ดาวตก (2024)"]');
await waitFor("return !!document.querySelector('[data-shelfav]')", 8000);
await shot("08-ปุ่มบนชั้นวาง.png", ".detail .actions", 6);
await c.evaluate("document.querySelector('[data-shelfav]')?.click()");
const opened = await waitFor("return document.querySelector('[data-movie-chip]')?.innerText.includes('ดาวตก')", 15000);
check("ปุ่มเสียงและซับในแผงขวาของชั้นวาง คู่กับกราฟเสียง เปิดหน้าเสียงและซับพร้อมเรื่องนั้น", opened, opened ? "" : await q("return document.querySelector('.main').innerText.slice(0,120)"));

// ---------- การ์ดตัวแปลงเสียงในหน้าตั้งค่า (ขั้น 4) · ไม่กดปุ่มเปิดโฟลเดอร์ (จะเปิด Explorer ขึ้นจอ) ----------
await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('ตั้งค่า')).click()");
await waitFor("return document.querySelectorAll('[data-setcard=encoders] [data-enc]').length >= 7", 20000);
const encRows = await q("return [...document.querySelectorAll('[data-setcard=encoders] [data-enc]')].map(r => r.innerText.replace(/\\s+/g, ' '))");
const encText = await q("return document.querySelector('[data-setcard=encoders]').innerText");
check("หน้าตั้งค่ามีการ์ดตัวแปลงเสียง flac 1.5.0 · libopus 1.6.1 · LAME 4.0 · wavpack 5.9.0 แนบมากับโปรแกรม พร้อมใช้งาน · qaac fdkaac ยังไม่ได้ใส่ · บอกโฟลเดอร์ตัวแปลง",
  encRows.some((r) => r.includes("flac") && r.includes("1.5.0") && r.includes("แนบมากับโปรแกรม") && r.includes("พร้อมใช้งาน")) && encRows.some((r) => r.includes("libopus 1.6.1")) && encRows.some((r) => r.startsWith("lame") && r.includes("4.0"))
  && encRows.some((r) => r.includes("wavpack") && r.includes("5.9.0")) && encRows.some((r) => r.includes("qaac64") && r.includes("ยังไม่ได้ใส่")) && encText.includes(String.raw`ชั้นหนัง\ตัวแปลง`), encRows.join(" | "));
await c.evaluate("document.querySelector('[data-setcard=encoders]').scrollIntoView({ block: 'center' })");
await shot("09-การ์ดตัวแปลงเสียง.png", "[data-setcard=encoders]", 6);

// ---------- ตัวดูซับรูป (ขั้น 6) · หนังที่มีซับ PGS กับ VobSub (สำเนาในโฟลเดอร์ทดสอบ) ----------
copyFileSync(join(AV, "ซับรูป (2024).mkv"), join(DIR, "ซับรูป (2024).mkv"));
await c.evaluate(`[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('เสียงและซับ')).click()`);
await sleep(400);
await clickTextAny(".avfoot button", "ล้างทั้งหมด").catch(() => {});
await sleep(300);
await drop([join(DIR, "ซับรูป (2024).mkv")]);
await waitFor(`return !!${findRow("PGS")}`, 20000);
await c.evaluate(`${findRow("PGS")}.querySelector('[data-subview]').click()`);
await waitFor("return !!document.querySelector('[data-subimgs]') || !!document.querySelector('[data-subviewer] .stat.bad')", 60000);
const pgs = await q("return (document.querySelector('[data-simg-count]')?.innerText ?? '') + ' · ' + document.querySelectorAll('[data-simg] img').length + ' · ' + (document.querySelector('[data-simg] .t')?.innerText.replace(/\\s+/g, ' ') ?? '')");
check("ซับรูป PGS ถอดเป็นภาพ 1 ภาพ ขึ้นที่ 0:01.0", pgs.startsWith("ภาพที่ 1–1 จาก 1") && pgs.includes("· 1 ·") && pgs.includes("0:01.0"), pgs);
await closeDlg();
await c.evaluate(`${findRow("VobSub")}.querySelector('[data-subview]').click()`);
await waitFor("return !!document.querySelector('[data-subimgs]') || !!document.querySelector('[data-subviewer] .stat.bad')", 60000);
const vob = await q("return (document.querySelector('[data-simg-count]')?.innerText ?? '') + ' · ' + document.querySelectorAll('[data-simg] img').length");
const imgOk = await waitFor("return [...document.querySelectorAll('[data-simg] img')].every(i => i.complete && i.naturalWidth > 0)", 8000);
check("ซับรูป VobSub ถอดเป็นภาพ 42 ภาพ หน้าละ 6 ภาพ รูปขึ้นครบ", vob.startsWith("ภาพที่ 1–6 จาก 42") && vob.endsWith("· 6") && imgOk, vob);
await shot("19-ดูซับรูป.png", "[role=dialog]", 8);
await c.evaluate("document.querySelector('[data-simg-next]').click()");
await waitFor("return document.querySelector('[data-simg-count]')?.innerText.startsWith('ภาพที่ 7–12') && document.querySelector('[data-simg] img')?.alt === 'ซับภาพ 7'", 15000);
await c.evaluate("document.querySelector('[data-simg]').click()");
await sleep(300);
const big = await q("const b = document.querySelector('[data-bigsub]'); if (!b) return ''; const r = b.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height) + ' · ' + b.nextElementSibling.innerText");
check("หน้าถัดไปได้ภาพ 7–12 · กดภาพดูเต็มจอ วางตรงตำแหน่งจริงบนจอ 720 × 480", big.includes("ภาพ 7") && big.includes("720 × 480") && Math.abs(Number(big.split("x")[0]) / Number(big.split("x")[1].split(" ")[0]) - 1.5) < 0.05, big);
await closeDlg();

await c.send("Emulation.clearDeviceMetricsOverride");
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 2) + "\n");
const failed = results.filter((x) => !x.pass);
console.log(`\nผ่าน ${results.length - failed.length} จาก ${results.length}`);
c.close();
process.exit(failed.length ? 1 : 0);
