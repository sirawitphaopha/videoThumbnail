// เทสข้อที่แก้ตามผู้ช่วยตรวจตอนจบ (7 พ.ย. 2569) ในหน้าต่างโปรแกรมจริง ผ่านพอร์ตดีบัก · ถ่ายภาพลงรายงาน
// ① เปลี่ยนหน้าระหว่างครอบ กลับมาเห็นงานเดิม ความคืบหน้า ปุ่มหยุด (โค้ดข้อ 6) · ② วางไฟล์ .wmv บอกทางไปต่อ (สเปกข้อ 34)
// ③ เปลี่ยนหน้าระหว่างคิด hash กลับมาเห็นว่างานยังทำอยู่ พร้อมปุ่มหยุด · คิดซ้อนไม่ได้ (โค้ดข้อ 6) · ④ หน้าต่างถามตอนปิด (โค้ดข้อ 2)
// ไฟล์หนังทุกไฟล์เป็นสำเนาในโฟลเดอร์ทดสอบ · ไม่กดยืนยันปิดโปรแกรมจริง
// ใช้: node scripts/check-review.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1 แบบอยู่หลังสุด)
import { mkdirSync, writeFileSync, copyFileSync, rmSync, readdirSync, existsSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const ROOT = process.cwd();
const SRC = join(ROOT, "test-media", "สร้าง", "หนัง");
const IMG = join(ROOT, "test-media", "สร้าง", "รูป");
const DIR = "D:\\dev\\tmp\\ชั้นตรวจจบ";
const OUT = "docs/report-2026-11-07/ตรวจจบ";
mkdirSync(OUT, { recursive: true });
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
copyFileSync(join(SRC, "ดาวเหนือ (2023).mkv"), join(DIR, "ดาวเหนือ (2023).mkv"));
copyFileSync(join(ROOT, "test-media", "สร้าง", "ไฟล์ผิดชนิด.wmv"), join(DIR, "หนังเก่า.wmv"));
// ไฟล์ใหญ่ราว 1.6 GB ต่อจากคลิปเดิมแบบไม่แปลงใหม่ (แบบเดียวกับตัวเทสขั้น 4) ให้งานยาวพอเปลี่ยนหน้าได้
const big = join(DIR, "หนังยาว (2020).mp4");
const list = join(DIR, "__list.txt");
writeFileSync(list, Array.from({ length: 100 }, () => `file '${join(SRC, "The Last Orchard (2022).mp4").replace(/\\/g, "/")}'`).join("\n"));
spawnSync(join(ROOT, "src-tauri", "tools", "ffmpeg.exe"), ["-v", "error", "-nostdin", "-n", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", big]);
rmSync(list);
const partials = () => readdirSync(DIR).filter((f) => f.endsWith(".partial"));

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const shot = async (f, sel, pad = 0) => { await c.move(100, 600); await sleep(250); return c.shot(`${OUT}/${f}`, sel, pad); };
const nav = (label) => c.evaluate(`[...document.querySelectorAll('[data-navbar] button')].find(b => b.innerText.includes(${JSON.stringify(label)})).click()`);
const drop = (path, zone) => c.evaluate(`(() => { const r = document.querySelector('[data-drop=${zone}]').getBoundingClientRect(); window.__posterDrop([${JSON.stringify(path)}], (r.left + 20) * devicePixelRatio, (r.top + 20) * devicePixelRatio); })()`);
const waitFor = async (js, ms = 20000) => { for (let t = 0; t < ms; t += 150) { if (await q(js)) return true; await sleep(150); } return false; };

await inv("dev_fake_free", { bytes: 0 });
await inv("set_settings", { patch: { folders: [DIR], outputFormat: "mkv", originalAfter: "keep", checkSourceBefore: false, checkOutputAfter: true, posterFormat: "jpg", jpgQuality: 90 } });
await c.evaluate("location.hash = ''; location.reload()"); await sleep(1500);
await waitFor("return !!document.querySelector('.book[data-movie=\"หนังยาว (2020)\"]')", 30000);

// ① วางไฟล์ .wmv บอกทางไปต่อ
await nav("ใส่โปสเตอร์"); await sleep(500);
await drop(join(DIR, "หนังเก่า.wmv"), "movie"); await sleep(500);
const wmv = await q("return document.querySelector('[data-card=movie]')?.innerText ?? ''");
await shot("01-วางไฟล์wmv.png", "[data-card=movie]", 8);
check("วางไฟล์ .wmv ช่องแดงบอก ใช้ไม่ได้ ต้องแปลงเป็น MKV หรือ MP4 ก่อน", wmv.includes("ไฟล์ .wmv ใช้ไม่ได้ ต้องแปลงเป็น MKV หรือ MP4 ก่อน"), wmv.split("\n")[0]);

// ② เปลี่ยนหน้าระหว่างครอบ กลับมาเห็นงานเดิม
await drop(big, "movie"); await waitFor("return (document.querySelector('[data-card=movie]')?.innerText ?? '').includes('หนังยาว')");
await drop(join(IMG, "poster.jpg"), "poster"); await waitFor("return !!document.querySelector('[data-use]')");
await sleep(600);
await c.evaluate("document.querySelector('[data-use]').click()"); await sleep(1200);
await c.evaluate("document.querySelector('[data-start]').click()");
await waitFor("return document.querySelector('[data-run]')?.dataset.run === 'working' && parseFloat(document.querySelector('[data-run] .bar i')?.style.width ?? '0') > 0", 15000);
await nav("ชั้นวางหนัง"); await sleep(800);
const away = await q("return !document.querySelector('[data-run]')");
await nav("ใส่โปสเตอร์"); await sleep(400);
const back = await q("return { run: document.querySelector('[data-run]')?.dataset.run, text: document.querySelector('[data-run]')?.innerText ?? '', movie: document.querySelector('[data-card=movie]')?.innerText ?? '', stop: [...document.querySelectorAll('[data-run] button')].some(b => b.innerText === 'หยุด'), poster: (document.querySelector('[data-card=poster]')?.innerText ?? '').includes('1000 × 1500') }");
await shot("02-กลับมาเห็นงานเดิม.png", ".main");
check("เปลี่ยนไปชั้นวางระหว่างครอบ แล้วกลับมา เห็นงานเดิม เปอร์เซ็นต์ ปุ่มหยุด ไฟล์หนังกับรูปโปสเตอร์ของงานนั้น", away && back.run === "working" && /กำลังครอบเป็น MKV/.test(back.text) && /\d+%/.test(back.text) && back.stop && back.movie.includes("หนังยาว (2020)") && back.poster, back.text.split("\n").join(" / "));
// ปุ่มหยุดยังใช้ได้ หน้าต่างยืนยันใช้โหมดของงานจริง
await c.evaluate("[...document.querySelectorAll('[data-run] button')].find(b => b.innerText === 'หยุด').click()"); await sleep(300);
const ask = await q("return document.querySelector('.dlg')?.innerText ?? ''");
await c.evaluate("[...document.querySelectorAll('.dlg button')].find(b => b.innerText === 'หยุด').click()");
await waitFor("return document.querySelector('[data-run]')?.dataset.run !== 'working'", 20000); await sleep(400);
const stopped = await q("return document.querySelector('[data-run]')?.innerText ?? ''");
check("กดหยุดหลังกลับมา ถามยืนยันหยุดครอบไฟล์ แล้วหยุดจริง ไฟล์ที่ทำค้างถูกลบ", ask.includes("ยืนยันหยุดครอบไฟล์") && stopped.includes("หยุดแล้ว") && partials().length === 0, stopped.split("\n").join(" / "));

// ③ เปลี่ยนหน้าระหว่างคิด hash กลับมาเห็นว่างานยังทำอยู่
await nav("ชั้นวางหนัง"); await sleep(500);
await c.click('.book[data-movie="หนังยาว (2020)"]'); await sleep(300);
await c.evaluate("[...document.querySelectorAll('.detail .btn')].find(b => b.innerText.includes('ข้อมูลไฟล์')).click()");
await waitFor("return !!document.querySelector('[data-hash-start]')");
await c.evaluate("document.querySelector('[data-hash-start]').click()"); await sleep(300);
await c.evaluate("[...document.querySelectorAll('[data-info-page] button')].find(b => b.innerText === 'กลับไปชั้นวาง').click()"); await sleep(300);
await c.evaluate("[...document.querySelectorAll('.detail .btn')].find(b => b.innerText.includes('ข้อมูลไฟล์')).click()");
const seen = await waitFor("return !!document.querySelector('[data-hash-elsewhere]')", 4000);
await shot("03-hashที่เริ่มไว้ยังทำอยู่.png", "[data-hash]", 8);
const twice = await c.evaluate(`window.__TAURI_INTERNALS__.invoke('hash_file', { path: ${JSON.stringify(big)}, algos: ['md5'] }).then(() => 'ทำได้', (e) => String(e))`);
check("กลับมาหน้าข้อมูลไฟล์ระหว่างคิด hash ขึ้นการ์ดว่างานที่เริ่มไว้ยังทำอยู่ พร้อมปุ่มหยุด · สั่งคิดซ้อนไม่ได้", seen && twice.includes("กำลังคิดค่า hash อีกไฟล์อยู่"), twice);
await c.evaluate("[...document.querySelectorAll('[data-hash-elsewhere] button')].find(b => b.innerText === 'หยุดงานนั้น')?.click()");
const gone = await waitFor("return !document.querySelector('[data-hash-elsewhere]')", 6000);
check("กดหยุดงานนั้น การ์ดหายเมื่องานหยุด กดคำนวณใหม่ได้", gone && (await inv("hash_running")) === false);

// ④ หน้าต่างถามตอนปิด · ไม่กดยืนยันปิดจริง
await c.evaluate("window.__TAURI_INTERNALS__.invoke('dev_fake_job', { seconds: 20 })");
await c.click(".titlebar .ctl button.close"); await sleep(500);
const dlg = await q("return document.querySelector('.dlg')?.innerText ?? ''");
await shot("04-ถามก่อนปิด.png", ".dlg", 8);
check("กดปิดตอนมีงาน หน้าต่างถามบอกว่าโปรแกรมรอลบไฟล์ที่ทำค้างก่อนปิด และรอการเขียนรูปแนบ", dlg.includes("โปรแกรมรอลบไฟล์ใหม่ที่ทำค้างไว้ก่อนปิด") && dlg.includes("ถ้ากำลังเปลี่ยนรูปแนบ รอให้เขียนเสร็จก่อน") && dlg.includes("ไฟล์หนังเดิมไม่ถูกแตะ"), dlg.split("\n").join(" / "));
await c.evaluate("[...document.querySelectorAll('.dlg button')].find(b => b.innerText === 'ทำงานต่อ').click()"); await sleep(300);
check("กดทำงานต่อ โปรแกรมยังอยู่", (await c.evaluate("document.title")) === "ชั้นหนัง");

// ⑤ การ์ดชื่อชนตอนแยกไฟล์บอกชื่อไฟล์ที่มีอยู่แล้ว (สเปกข้อ 10) · หน้าข้อมูลไฟล์ของข้อ ③ ยังเปิดอยู่ กดกลับไปชั้นวางก่อน
await nav("ชั้นวางหนัง"); await sleep(400);
await c.evaluate("[...document.querySelectorAll('[data-info-page] button')].find(b => b.innerText === 'กลับไปชั้นวาง')?.click()"); await sleep(400);
await c.click('.book[data-movie="ดาวเหนือ (2023)"]'); await sleep(300);
await c.evaluate("[...document.querySelectorAll('.detail .btn')].find(b => b.innerText.includes('ข้อมูลไฟล์')).click()");
await waitFor("return !!document.querySelector('[data-mi]')");
for (const t of ["Audio #2", "Text #1"]) await c.evaluate(`[...document.querySelectorAll('[data-mi] .mih.pick')].find(h => h.innerText.includes(${JSON.stringify(t)})).click()`);
await c.evaluate("document.querySelector('[data-extract-start]').click()");
await waitFor("return document.querySelector('[data-extract]').innerText.includes('แยกครบ')");
await c.evaluate("[...document.querySelectorAll('[data-extract] button')].find(b => b.innerText === 'แยกอย่างอื่นต่อ').click()"); await sleep(200);
await c.evaluate("document.querySelector('[data-extract-start]').click()");
await waitFor("return !!document.querySelector('[data-conflict]')");
const conflict = await q("return document.querySelector('[data-extract]').innerText");
await shot("05-ชื่อชนบอกชื่อไฟล์.png", "[data-extract]", 8);
check("แยกซ้ำ 2 ชิ้น การ์ดชื่อชนบอกชื่อไฟล์ที่มีอยู่แล้วทั้ง 2 ไฟล์ · ปุ่มข้ามบอกจำนวน", conflict.includes("ในที่เก็บมีไฟล์ ดาวเหนือ (2023).Audio2.en.ac3 อยู่แล้ว") && conflict.includes("ในที่เก็บมีไฟล์ ดาวเหนือ (2023).Text1.th.srt อยู่แล้ว") && conflict.includes("ข้ามทั้ง 2 ไฟล์"), conflict.split("\n").join(" / "));
await c.evaluate("[...document.querySelectorAll('[data-extract] button')].find(b => b.innerText.startsWith('ข้ามทั้ง')).click()"); await sleep(400);

// ⑥ มาจากปุ่มเปลี่ยนโปสเตอร์ · การ์ดรูปไม่ใช่ 2:3 · รูปที่ต้องแปลงก่อนแนบ (สเปกข้อ 17 18 19 20)
await c.evaluate("[...document.querySelectorAll('[data-info-page] button')].find(b => b.innerText === 'กลับไปชั้นวาง').click()"); await sleep(300);
await c.click('.book[data-movie="ดาวเหนือ (2023)"]'); await sleep(300);
await c.evaluate("[...document.querySelectorAll('.detail .btn')].find(b => b.innerText.includes('โปสเตอร์')).click()");
await waitFor("return (document.querySelector('[data-card=movie]')?.innerText ?? '').includes('ดาวเหนือ')");
const first = await q("return { poster: document.querySelector('[data-card=poster]')?.innerText ?? '', result: document.querySelector('[data-card=result]')?.innerText ?? '', bold: [...document.querySelectorAll('[data-card=result] b')].map(b => b.innerText) }");
await shot("06-มาจากปุ่มเปลี่ยนโปสเตอร์.png", ".cards, .main", 0);
check("มาจากปุ่มเปลี่ยนโปสเตอร์ ช่องวางรูปบอก ไฟล์หนังใส่ให้แล้ว เหลือแค่ลากรูปใหม่มาวาง · รับ JPG PNG WebP BMP TIFF HEIC · การ์ด 3 ตัวหนา ไฟล์เป็น MKV อยู่แล้ว เปลี่ยนแค่รูปแนบ ไม่ต้องครอบใหม่",
  first.poster.includes("ไฟล์หนังใส่ให้แล้ว เหลือแค่ลากรูปใหม่มาวาง") && first.poster.includes("JPG PNG WebP BMP TIFF HEIC") && first.bold.includes("ไฟล์เป็น MKV อยู่แล้ว เปลี่ยนแค่รูปแนบ ไม่ต้องครอบใหม่"), first.poster.split("\n").slice(0, 3).join(" / "));
await drop(join(IMG, "wide.jpg"), "poster"); await waitFor("return !!document.querySelector('[data-use]')"); await sleep(800);
await c.evaluate("document.querySelector('[data-use]').click()"); await sleep(1200);
const wide = await q("return { text: document.querySelector('[data-card=poster]')?.innerText ?? '', seg: [...document.querySelectorAll('[data-card=poster] .seg button')].map(b => b.innerText) }");
await shot("07-รูปไม่ใช่2ต่อ3.png", "[data-card=poster]", 8);
check("รูปแนวนอน การ์ดรูปบอก ภาพแนวนอน 16 : 9 · เลือก ตัดให้พอดีปก เติมขอบให้เต็ม ตามรูปเดิม · ปุ่ม ครอปเองพร้อมดูตัวอย่าง",
  wide.text.includes("ภาพแนวนอน 16 : 9") && ["ตัดให้พอดีปก", "เติมขอบให้เต็ม", "ตามรูปเดิม"].every((s) => wide.seg.includes(s)) && wide.text.includes("ครอปเองพร้อมดูตัวอย่าง"), wide.seg.join(" | "));
await c.evaluate("[...document.querySelectorAll('[data-card=poster] .seg button')].find(b => b.innerText === 'เติมขอบให้เต็ม').click()");
await waitFor("return (document.querySelector('[data-card=poster]')?.innerText ?? '').includes('เติมขอบให้เต็มปก')", 8000);
const padded = await q("return document.querySelector('[data-card=poster]')?.innerText ?? ''");
check("กด เติมขอบให้เต็ม ทำรูปใหม่ทันที การ์ดบอก เติมขอบให้เต็มปก 1000 × 1500", padded.includes("เติมขอบให้เต็มปก") && padded.includes("1000 × 1500"), padded.split("\n").slice(0, 4).join(" / "));
await drop(join(IMG, "poster.webp"), "poster"); await waitFor("return !!document.querySelector('[data-use]')"); await sleep(800);
await c.evaluate("document.querySelector('[data-use]').click()"); await sleep(1200);
const conv = await q("return document.querySelector('[data-convert]')?.innerText ?? ''");
await shot("08-ต้องแปลงก่อนแนบ.png", "[data-card=poster]", 8);
check("รูป WebP การ์ดรูปบอก poster.webp ต้องแปลงก่อนแนบ · นามสกุลเดิม .webp → .jpg · ปุ่มคู่ แปลงเป็น JPG PNG", conv.includes("poster.webp ต้องแปลงก่อนแนบ") && conv.includes(".webp → .jpg") && conv.includes("แปลงเป็น"), conv.split("\n").join(" / "));

check("ไม่มีไฟล์ชั่วคราว .partial ค้างในโฟลเดอร์ทดสอบ · ไฟล์ใหญ่ยังอยู่ขนาดเดิม", partials().length === 0 && existsSync(big) && statSync(big).size > 1e9);
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 2) + "\n");
const failed = results.filter((x) => !x.pass);
console.log(`\nผ่าน ${results.length - failed.length} จาก ${results.length}`);
c.close();
process.exit(failed.length ? 1 : 0);
