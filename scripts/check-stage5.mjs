// เทสขั้น 5 ข้อมูลไฟล์ แยกไฟล์ ค่า hash ในหน้าต่างโปรแกรมจริง (แผนขั้น 5 · ยังทำไม่ครบ เป็นงานที่ทำค้าง)
// ใช้: node scripts/check-stage5.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1)
import { mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const SRC = join("test-media", "สร้าง", "หนัง");
const DIR = "D:\\dev\\tmp\\ชั้นข้อมูลไฟล์";
const OUT = "docs/report-2026-11-06/ขั้น5";
mkdirSync(OUT, { recursive: true });
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
copyFileSync(join(SRC, "ดาวเหนือ (2023).mkv"), join(DIR, "ดาวเหนือ (2023).mkv"));
const movie = join(DIR, "ดาวเหนือ (2023).mkv");
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const h0 = sha(movie);

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const shot = async (f, sel) => { await c.move(100, 600); await sleep(250); return c.shot(`${OUT}/${f}`, sel, 0); };

await inv("set_settings", { patch: { folders: [DIR] } });
await c.evaluate("location.hash = ''; location.reload()"); await sleep(2500);
await c.book("ดาวเหนือ (2023)"); await sleep(300);
await c.evaluate("[...document.querySelectorAll('.detail .btn')].find(b => b.innerText.includes('MediaInfo')).click()");
for (let i = 0; i < 40 && !(await q("return !!document.querySelector('[data-mi]')")); i++) await sleep(150);
const heads = await q("return [...document.querySelectorAll('[data-mi] .mih')].map(h => h.innerText.replace(/\\n/g, ' '))");
await shot("01-ข้อมูลไฟล์.png", ".main");
// ตรงกับรัน MediaInfo เองทุกบรรทัด
const mine = await q("return [...document.querySelectorAll('[data-mi] .mir')].map(r => r.children[0].innerText + ' : ' + r.children[2].innerText)");
const theirs = spawnSync(join("src-tauri", "tools", "MediaInfo.exe"), [movie], { encoding: "utf8" }).stdout.split(/\r?\n/).filter((l) => l.includes(" : ")).map((l) => { const i = l.indexOf(" : "); return l.slice(0, i).trim() + " : " + l.slice(i + 3).trim(); });
check("ข้อความ MediaInfo ตรงกับรัน MediaInfo เองทุกบรรทัด · หัวข้อติ๊กได้บอกนามสกุลที่จะได้", JSON.stringify(mine) === JSON.stringify(theirs) && heads.some((h) => h.includes("Audio #2") && h.includes("แยกเป็น .ac3")), `${mine.length} บรรทัด · ${heads.join(" | ")}`);

// ติ๊ก Audio #2 Text #1 Menu แล้วแยก
for (const t of ["Audio #2", "Text #1", "Menu"]) await c.evaluate(`[...document.querySelectorAll('[data-mi] .mih.pick')].find(h => h.innerText.includes(${JSON.stringify(t)})).click()`);
await sleep(200);
const bar = await q("return document.querySelector('[data-extract]').innerText");
await shot("02-เลือกแยก.png", "[data-extract]");
await c.evaluate("document.querySelector('[data-extract-start]').click()");
for (let i = 0; i < 100 && !(await q("return document.querySelector('[data-extract]').innerText.includes('แยกครบ')")); i++) await sleep(150);
const xdone = await q("return document.querySelector('[data-extract]').innerText");
await shot("03-แยกครบ.png", "[data-extract]");
const xdir = join(DIR, "ดาวเหนือ (2023) แยกไฟล์");
const files = existsSync(xdir) ? readdirSync(xdir) : [];
check("ติ๊ก 3 อย่างแล้วแยก ได้ครบ 3 ไฟล์ ชื่อแบบต้นแบบ · ไฟล์หนังเดิม hash เท่าเดิม", bar.includes("เลือกไว้ 3 อย่าง") && xdone.includes("แยกครบ 3 ไฟล์") && files.includes("ดาวเหนือ (2023).Audio2.en.ac3") && files.includes("ดาวเหนือ (2023).Text1.th.srt") && files.includes("ดาวเหนือ (2023).chapters.xml") && sha(movie) === h0, files.join(", "));

// แยกซ้ำ ชื่อชน · ไม่เขียนทับ
await c.evaluate("[...document.querySelectorAll('[data-extract] button')].find(b => b.innerText === 'แยกอย่างอื่นต่อ').click()"); await sleep(200);
const before = Object.fromEntries(files.map((f) => [f, sha(join(xdir, f))]));
await c.evaluate("document.querySelector('[data-extract-start]').click()");
for (let i = 0; i < 60 && !(await q("return document.querySelector('[data-extract]').innerText.includes('มีไฟล์ชื่อเดียวกันอยู่แล้ว')")); i++) await sleep(150);
const conflict = await q("return document.querySelector('[data-extract]').innerText");
await shot("04-ชื่อชน.png", "[data-extract]");
const same = files.every((f) => sha(join(xdir, f)) === before[f]);
await c.evaluate("[...document.querySelectorAll('[data-extract] button')].find(b => b.innerText === 'ตั้งชื่อใหม่ต่อท้ายเลข 2').click()");
for (let i = 0; i < 100 && !(await q("return document.querySelector('[data-extract]').innerText.includes('แยกครบ')")); i++) await sleep(150);
const files2 = readdirSync(xdir);
check("แยกซ้ำ ชื่อชน บอกมีไฟล์ชื่อเดียวกันอยู่แล้ว ไม่เขียนทับ · กดตั้งชื่อใหม่ต่อท้ายเลข 2 ได้ไฟล์ใหม่", conflict.includes("โปรแกรมไม่เขียนทับไฟล์เดิม") && same && files2.includes("ดาวเหนือ (2023).Audio2.en 2.ac3"), files2.join(", "));
// การ์ดบอกชื่อไฟล์ที่มีอยู่แล้วทุกไฟล์ · ชน 3 ไฟล์ ปุ่มข้ามบอกจำนวน (ผู้ช่วยตรวจสเปกข้อ 10)
check("การ์ดชื่อชนบอกชื่อไฟล์ที่มีอยู่แล้วทุกไฟล์ · ชนหลายไฟล์ปุ่มข้ามบอกจำนวน", conflict.includes("ในที่เก็บมีไฟล์ ดาวเหนือ (2023).Audio2.en.ac3 อยู่แล้ว") && conflict.includes("ในที่เก็บมีไฟล์ ดาวเหนือ (2023).Text1.th.srt อยู่แล้ว") && conflict.includes("ข้ามทั้ง 3 ไฟล์"), conflict.split("\n").join(" / "));

// ค่า hash
await c.evaluate("document.querySelector('[data-hash-start]').click()");
for (let i = 0; i < 100 && !(await q("return !!document.querySelector('[data-hash] .hrow')")); i++) await sleep(150);
await sleep(300);
const vals = await q("return Object.fromEntries([...document.querySelectorAll('[data-hash] .hrow')].map(r => [r.querySelector('.halg').innerText, r.querySelector('.hval').innerText]))");
const win = (alg) => spawnSync("powershell", ["-NoProfile", "-Command", `(Get-FileHash -Algorithm ${alg} -LiteralPath $env:F).Hash`], { env: { ...process.env, F: movie }, encoding: "utf8" }).stdout.trim().toLowerCase();
check("ค่า hash ตรงกับตัวคำนวณของ Windows · CRC32 ตัวพิมพ์ใหญ่", vals["MD5"] === win("MD5") && vals["SHA-256"] === win("SHA256") && /^[0-9A-F]{8}$/.test(vals["CRC32"] ?? ""), JSON.stringify(vals));
const lib = (await inv("get_library")).movies.find((m) => m.path === movie);
check("ค่า SHA-256 จดไว้ในคลังใช้ตอนตรวจแบบเร็ว", lib?.sha256 === vals["SHA-256"]);
await c.evaluate("document.querySelector('[data-hash] input').focus()");
await c.type(vals["SHA-256"].slice(0, 62) + "ff"); await sleep(500);
const bad = await q("return document.querySelector('[data-hash]').innerText");
await shot("05-ค่าhashไม่ตรง.png", "[data-hash]");
check("วางค่าที่ต่างตัวท้าย บอกไม่ตรงกับ SHA-256 ต่างกันที่ 2 ตัวท้าย", bad.includes("ไม่ตรงกับ SHA-256 ของไฟล์นี้") && bad.includes("ต่างกันที่ 2 ตัวท้าย"));

// บันทึกไฟล์ .sha256 · ไม่เขียนทับ
await c.evaluate("[...document.querySelectorAll('[data-hash] button')].find(b => b.innerText === 'บันทึกเป็นไฟล์ .sha256').click()"); await sleep(600);
await c.evaluate("[...document.querySelectorAll('[data-hash] button')].find(b => b.innerText === 'บันทึกเป็นไฟล์ .sha256').click()"); await sleep(600);
const s1 = join(DIR, "ดาวเหนือ (2023).mkv.sha256"), s2 = join(DIR, "ดาวเหนือ (2023).mkv (2).sha256");
check("บันทึกไฟล์ .sha256 แบบที่ sha256sum อ่านได้ · กดซ้ำไม่เขียนทับ ได้ไฟล์ (2)", existsSync(s1) && existsSync(s2) && readFileSync(s1, "utf8") === `${vals["SHA-256"]} *ดาวเหนือ (2023).mkv\n`, readdirSync(DIR).filter((f) => f.endsWith(".sha256")).join(", "));

// ไฟล์แนบใน MKV ขึ้นเป็นหัวข้อ แยกปกออกมาได้ · ไฟล์ MP4 แยกเสียงด้วย ffmpeg
copyFileSync(join(SRC, "Harbor Lights (2021).mkv"), join(DIR, "Harbor Lights (2021).mkv"));
copyFileSync(join(SRC, "The Last Orchard (2022).mp4"), join(DIR, "The Last Orchard (2022).mp4"));
const att = await inv("media_info", { path: join(DIR, "Harbor Lights (2021).mkv") });
const a1 = att.sections.find((s) => s.kind === "attachment");
const xr = await inv("extract_start", { req: { path: join(DIR, "Harbor Lights (2021).mkv"), folder: null, items: [{ kind: "attachment", nth: 1, ext: a1?.ext ?? "jpg", lang: null, name: a1?.rows.find((r) => r[0] === "File name")?.[1] ?? null }], policy: ["ask"] } });
const cover = join(DIR, "Harbor Lights (2021) แยกไฟล์", "Harbor Lights (2021).cover.jpg");
check("ไฟล์แนบใน MKV ขึ้นเป็นหัวข้อ Attachment บอกขนาดรูป แยกปกออกมาเป็น .cover.jpg", a1 && a1.rows.some((r) => r[1] === "cover.jpg") && a1.rows.some((r) => r[0] === "Dimensions" && / × /.test(r[1])) && xr.states[0] === "done" && existsSync(cover), a1?.rows.map((r) => r.join(" ")).join(" · "));
const mp4 = join(DIR, "The Last Orchard (2022).mp4");
const mi = await inv("media_info", { path: mp4 });
const au = mi.sections.find((s) => s.kind === "audio");
const xr2 = await inv("extract_start", { req: { path: mp4, folder: null, items: [{ kind: "audio", nth: 1, ext: au.ext, lang: au.lang, name: null }], policy: ["ask"] } });
const aac = xr2.files[0];
const probe = aac ? JSON.parse(spawnSync(join("src-tauri", "tools", "ffprobe.exe"), ["-v", "error", "-print_format", "json", "-show_streams", aac], { encoding: "utf8" }).stdout) : {};
check("ไฟล์ MP4 แยกเสียงเป็น .aac ด้วย ffmpeg ไม่แปลงใหม่ เปิดได้", xr2.states[0] === "done" && probe.streams?.[0]?.codec_name === "aac", aac?.split("\\").pop());

// กดหยุดกลางทาง · ไฟล์ใหญ่ราว 1.6 GB (ต่อจากคลิปเดิมแบบไม่แปลงใหม่) แยกภาพแล้วกดหยุด · คิด hash แล้วกดหยุด
{
  const list = join(DIR, "__list.txt");
  writeFileSync(list, Array.from({ length: 100 }, () => `file '${join(process.cwd(), SRC, "The Last Orchard (2022).mp4").replace(/\\/g, "/")}'`).join("\n"));
  const big = join(DIR, "หนังยาว (2020).mkv");
  spawnSync(join("src-tauri", "tools", "ffmpeg.exe"), ["-v", "error", "-nostdin", "-n", "-f", "concat", "-safe", "0", "-i", list, "-map", "0:v", "-map", "0:a", "-c", "copy", big]);
  rmSync(list);
  const hb = sha(big);
  const xdir2 = join(DIR, "หนังยาว (2020) แยกไฟล์");
  const run = c.evaluate(`window.__TAURI_INTERNALS__.invoke("extract_start", { req: { path: ${JSON.stringify(big)}, folder: null, items: [{ kind: "video", nth: 1, ext: "mkv", lang: null, name: null }], policy: ["ask"] } })`);
  let seen = false;
  for (let i = 0; i < 200 && !seen; i++) { await sleep(50); seen = existsSync(xdir2) && readdirSync(xdir2).some((f) => f.endsWith(".partial")); }
  await sleep(200);
  await inv("extract_cancel");
  const r = await run;
  const left = existsSync(xdir2) ? readdirSync(xdir2) : [];
  check("แยกภาพจากไฟล์ใหญ่แล้วกดหยุด ไฟล์ที่ทำค้างถูกลบ ไฟล์หนังเดิม hash เท่าเดิม", seen && r.states[0] === "cancelled" && left.length === 0 && sha(big) === hb, `${r.states[0]} · เหลือ ${left.length} ไฟล์`);
  const hr = c.evaluate(`window.__TAURI_INTERNALS__.invoke("hash_file", { path: ${JSON.stringify(big)}, algos: ["sha256", "sha512"] })`);
  await sleep(300);
  await inv("hash_cancel");
  check("คิดค่า hash ไฟล์ใหญ่แล้วกดหยุด หยุดได้ทันที ไม่มีผล", (await hr) === null);
}

// หน้าจอกำลังแยก · กำลังคำนวณ · ที่ว่างไม่พอ · คัดลอกข้อมูล (ไฟล์ใหญ่ 1.6 GB)
{
  await inv("scan_library");
  for (let i = 0; i < 100 && (await inv("get_library")).scanning; i++) await sleep(200);
  await c.evaluate("[...document.querySelectorAll('button')].find(b => b.innerText === 'กลับไปชั้นวาง')?.click()"); await sleep(500);
  await c.book("หนังยาว (2020)"); await sleep(300);
  await c.evaluate("[...document.querySelectorAll('.detail .btn')].find(b => b.innerText.includes('MediaInfo')).click()");
  for (let i = 0; i < 60 && !(await q("return !!document.querySelector('[data-mi]')")); i++) await sleep(150);
  await c.evaluate("document.querySelector('[data-kinds]').scrollIntoView()"); await sleep(200);
  await shot("06-ชื่อชนิดที่เจอบ่อย.png", "[data-kinds]");
  check("การ์ดชื่อชนิดที่เจอบ่อย ภาพ เสียง ซับ ครบ 11 แถวตามต้นแบบ", (await q("return document.querySelectorAll('[data-kinds] .kindrow').length")) === 11);
  await c.evaluate("[...document.querySelectorAll('[data-mi] .mih.pick')].find(h => h.innerText.includes('Video')).click()");
  await c.evaluate("[...document.querySelectorAll('[data-mi] .mih.pick')].find(h => h.innerText.includes('Audio')).click()");
  await c.evaluate("document.querySelector('[data-extract-start]').click()");
  for (let i = 0; i < 100 && !(await q("return /กำลังทำ [1-9]/.test(document.querySelector('[data-extract]').innerText)")); i++) await sleep(50);
  const xr = await q("return document.querySelector('[data-extract]').innerText");
  await shot("07-กำลังแยก.png", "[data-extract]");
  await c.evaluate("[...document.querySelectorAll('[data-extract] button')].find(b => b.innerText === 'หยุด').click()");
  for (let i = 0; i < 100 && !(await q("return document.querySelector('[data-extract]').innerText.includes('หยุดแล้ว')")); i++) await sleep(100);
  check("กำลังแยก แถวละชิ้น Video .mkv กำลังทำ เปอร์เซ็นต์ Audio รอคิว ปุ่มหยุด", /Video #?1? ?\.mkv|Video \.mkv/.test(xr) && /กำลังทำ \d+%/.test(xr) && xr.includes("รอคิว") && xr.includes("หยุด"), xr.split("\n").join(" / "));
  await c.evaluate("[...document.querySelectorAll('[data-extract] button')].find(b => b.innerText === 'แยกอย่างอื่นต่อ')?.click()"); await sleep(200);
  await inv("dev_fake_free", { bytes: 100 * 1024 * 1024 });
  await c.evaluate("document.querySelector('[data-extract-start]').click()");
  for (let i = 0; i < 60 && !(await q("return document.querySelector('[data-extract]').innerText.includes('ไม่พอ')")); i++) await sleep(100);
  const ns = await q("return document.querySelector('[data-extract]').innerText");
  await shot("08-แยกที่ว่างไม่พอ.png", "[data-extract]");
  await inv("dev_fake_free", { bytes: 0 });
  check("แยก Video ไม่สำเร็จ พื้นที่ในไดรฟ์ D ไม่พอ ต้องการเท่าไหร่ เหลือเท่าไหร่ ไฟล์ที่แยกเสร็จแล้วยังอยู่ครบ ปุ่มลองใหม่", ns.includes("แยก Video ไม่สำเร็จ พื้นที่ในไดรฟ์ D ไม่พอ") && /ต้องการ .+ แต่เหลือ 100 MB/.test(ns) && ns.includes("ไฟล์ที่แยกเสร็จแล้วยังอยู่ครบ") && ns.includes("ลองใหม่"), ns.split("\n").join(" / "));
  await c.evaluate("[...document.querySelectorAll('[data-hash] .algs label')].find(l => l.innerText.includes('SHA-512')).click()");
  await c.evaluate("document.querySelector('[data-hash-start]').click()");
  for (let i = 0; i < 100 && !(await q("return document.querySelector('[data-hash]').innerText.includes('อ่านไฟล์ไปแล้ว')")); i++) await sleep(50);
  await sleep(300);
  const hp = await q("return document.querySelector('[data-hash]').innerText");
  await shot("09-กำลังคำนวณ.png", "[data-hash]");
  await c.evaluate("[...document.querySelectorAll('[data-hash] button')].find(b => b.innerText === 'หยุด').click()"); await sleep(500);
  check("กำลังคำนวณ บอกอ่านไฟล์ไปแล้วกี่ GB จากเท่าไหร่ แถบ ปุ่มหยุด · กดหยุดแล้วกลับเป็นปุ่มคำนวณ", /SHA-256 อ่านไฟล์ไปแล้ว .+ จาก .+GB หรือ \d+%/.test(hp) && hp.includes("หยุด") && (await q("return !!document.querySelector('[data-hash-start]')")), hp.split("\n").join(" / "));
  await c.evaluate("[...document.querySelectorAll('button')].find(b => b.innerText === 'คัดลอกข้อมูลเป็นข้อความ').click()"); await sleep(400);
  const toast = await q("return document.querySelector('.toast')?.innerText ?? ''");
  await shot("10-คัดลอกข้อมูล.png", ".toast", 6);
  check("คัดลอกข้อมูลเป็นข้อความ ขึ้นแถบ คัดลอกข้อมูลไฟล์แล้ว วางในแชทหรือโน้ตได้เลย แถบนี้หายเองใน 3 วินาที", toast.includes("คัดลอกข้อมูลไฟล์แล้ว") && toast.includes("วางในแชทหรือโน้ตได้เลย"), toast.split("\n").join(" / "));
}

writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 2) + "\n");
const failed = results.filter((x) => !x.pass);
console.log(`\nผ่าน ${results.length - failed.length} จาก ${results.length}`);
c.close();
process.exit(failed.length ? 1 : 0);
