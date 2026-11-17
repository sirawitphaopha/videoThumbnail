// หน้า OCR ซับรูป (แผน OCR ขั้น 11 · BUGS ข้อ 143 · src/pages/ocr/OcrPage.tsx OcrDialogs.tsx lib/ocrJob.ts ocrjob.rs)
// ตรวจ ปุ่มเปิด OCR ข้างปุ่มแปลงซับภาพ · ปุ่มเลือกงานสามแบบ · แถวเลือกตัวอ่านไม่ล้นไม่ซ้อน · อ่านจริงทั้งไฟล์ด้วย PaddleOCR ไทย ความคืบหน้า สรุป
//   · แก้ข้อความ ตัวเอียง ถูกแล้ว · แบบตรวจทีละจุด · หน้าต่างสอนตัวอักษรกับฐาน nOCR ว่าง (ขยายกรอบ จำ ข้าม ใช้ครั้งเดียว หยุด) ฐานลงโฟลเดอร์ผู้ใช้แล้วลบลงถังขยะตอนจบ
//   · หน้าต่างแต่งภาพ ตัวอ่านและชุดภาษา ตัวเลือก ขนาดเท่ากัน ไม่ต้องเลื่อน Esc ปิด · ภาพหลังแต่งจาก Rust · ระยะใต้แถวบน กรอบลงถึงล่างหน้าต่าง
//   · ตั้ง MOVIE_SHELF_OCR_SUP (ซับ ACCA) ตรวจหน้าต่างคำที่ไม่รู้จักระหว่างอ่านเพิ่ม ภาพของไฟล์นี้ไม่บันทึก (ห้ามขึ้น git)
// ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-ocr.mjs · ตอนพี่กันทำงานอยู่ส่ง NOGATE=1
// คืนค่าตั้ง OCR แบบตรวจทาน และการถามคำที่ไม่รู้จักเป็นค่าเดิมตอนจบ · ล้างหน้าซับไตเติลก่อนและหลัง · ภาพลง docs/report-2026-11-16/OCR-ขั้น11/
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";

const NOGATE = process.env.NOGATE === "1";
const gate = () => { if (NOGATE) return; try { execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/fg-gate.ps1"], { stdio: "ignore" }); } catch { console.log("หน้าต่างชั้นหนังอยู่หน้าสุดของจอ หยุดตรวจ"); process.exit(2); } };
gate();
const TH = "D:/movie-shelf/test-media/สร้าง/ocr/th.sup";
const ACCA = process.env.MOVIE_SHELF_OCR_SUP?.replace(/\\/g, "/");
const SHOT = "docs/report-2026-11-16/OCR-ขั้น11";
const DB = "ตรวจหน้าOCR";
mkdirSync(SHOT, { recursive: true });

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(200); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click(); return 1;`);
const click = async (sel) => { gate(); await c.click(sel); };
const job = (js) => q(`const j = window.__ocrJob; ${js}`);

// เริ่มจากหน้าโหลดใหม่ ตัวเก็บงานว่าง · เก็บค่าตั้งเดิมไว้คืนตอนจบ
await q("location.reload(); return 1;").catch(() => {});
await sleep(5000);
const saved = await q("return { cfg: localStorage.getItem('ms.ocrCfg'), prompt: localStorage.getItem('ms.ocrPrompt'), view: localStorage.getItem('ms.ocrView'), bg: localStorage.getItem('ms.ocrImgBg') };");
await q("localStorage.removeItem('ms.ocrCfg'); localStorage.removeItem('ms.ocrPrompt'); localStorage.removeItem('ms.ocrImgBg'); localStorage.setItem('ms.ocrView', 'table'); location.reload(); return 1;").catch(() => {});
await sleep(5000);
await q(`await window.__TAURI_INTERNALS__.invoke('ocr_db_delete', { kind: 'nocr', name: ${JSON.stringify(DB)} }).catch(() => {}); return 1;`);
await nav("ซับไตเติล"); await sleep(600);
await q(`window.__subClear(); window.__subOpen(${JSON.stringify(TH)}); return 1;`);

// ---------- ปุ่มเปิดกับปุ่มเลือกงาน ----------
check("ซับรูปมีปุ่ม OCR เป็นตัวหนังสือข้างปุ่มแปลงซับภาพ", await waitFor("const a = document.querySelector('[data-imgconv-open]'), b = document.querySelector('[data-ocr-open]'); return !!(a && b && a.nextElementSibling === b);", 30000));
const modes = await q("return [...document.querySelectorAll('[data-sub-mode] button')].map((b) => ({ t: b.innerText.trim(), off: b.getAttribute('aria-disabled'), why: b.title }));");
check("ปุ่มเลือกงานสามแบบ ดูซับ OCR แก้ซับกับวิดีโอ", modes.length === 3 && modes[0].t === "ดูซับ" && modes[1].t.includes("OCR"), JSON.stringify(modes.map((m) => m.t)));
check("แก้ซับกับวิดีโอยังกดไม่ได้พร้อมเหตุผล", modes[2]?.off === "true" && modes[2].why.includes("OCR"), modes[2]?.why);
await click("[data-ocr-open]");
check("กดแล้วขึ้นหน้า OCR แทนตัวดูซับรูป 17 ภาพ", await waitFor("return document.querySelectorAll('[data-ocr-table] tbody tr').length === 17 && !document.querySelector('[data-subviewer-inline]');", 30000));
check("ปุ่มเลือกงานเปลี่ยนเป็น OCR", await q("return document.querySelector('[data-sub-mode] button[aria-pressed=true]')?.innerText.includes('OCR');"));

// ---------- แถวเลือกตัวอ่าน ----------
const row = await q(`const r = document.querySelector('[data-ocr-engine]'); const kids = [...r.children].map((k) => k.getBoundingClientRect()).filter((b) => b.width > 0);
  let lap = 0; for (let i = 1; i < kids.length; i++) if (kids[i].left < kids[i - 1].right - 0.5) lap++;
  return { over: r.scrollWidth - r.clientWidth, lap, right: Math.max(...kids.map((b) => b.right)), box: r.getBoundingClientRect().right };`);
check("แถวเลือกตัวอ่านไม่ล้นไม่ซ้อนที่หน้าต่าง 1280 × 800", row.over <= 0 && row.lap === 0 && row.right <= row.box + 0.5, JSON.stringify(row));
const gap = await q("const b = document.querySelector('.titlebar').getBoundingClientRect(), d = document.querySelector('[data-ocr-engine] > div').getBoundingClientRect(), f = document.querySelector('[data-ocr-foot]').getBoundingClientRect(); return { gap: Math.round(d.top - b.bottom), foot: Math.round(innerHeight - f.bottom) };");
check("ระยะใต้แถบชื่อโปรแกรมถึงแถวเลือกตัวอ่านไม่เกิน 16 จุด (แถวบนย้ายขึ้นแถบชื่อ BUGS 149)", gap.gap <= 16, `${gap.gap} จุด`);
check("แถวบนของหน้าซับไตเติลอยู่ในแถบชื่อโปรแกรม", await q("return !!document.querySelector('.titlebar [data-sub-bar] [data-sub-mode]') && !document.querySelector('.ag [data-sub-bar]');"));
check("แถบล่างลงถึงล่างหน้าต่าง เหลือไม่เกิน 16 จุด", gap.foot <= 16, `${gap.foot} จุด`);
await c.shot(`${SHOT}/01-ก่อนอ่าน.png`);

// ---------- อ่านจริงด้วย PaddleOCR ไทย ----------
await job("j.setCfg({ engine: 'paddle', paddle: { lang: 'th', size: 'small', vertical: 'auto', orientation: false }, helpers: ['own'], lang3: 'tha', dict: '' }); return 1;");
await click("[data-ocr-start]");
check("ระหว่างอ่านมีแถบความคืบหน้ากับปุ่มหยุดชั่วคราว", await waitFor("return !!document.querySelector('[data-ocr-prog]') && !!document.querySelector('[data-ocr-pause]');", 8000));
check("ระหว่างอ่านแถวเลือกตัวอ่านเปลี่ยนไม่ได้พร้อมเหตุผล", await q("return [...document.querySelectorAll('[data-ocr-engine] .dd')].some((d) => (d.title || d.closest('[title]')?.title || '').includes('หยุดอ่านก่อน'));"));
check("อ่านครบ 17 ภาพ", await waitFor("const g = window.__ocrJob.get(); return !g.running && g.rows.every((r) => r.state === 'done');", 120000));
const sum = await q("return { sum: document.querySelector('[data-ocr-sum]')?.innerText ?? '', foot: document.querySelector('[data-ocr-foot]')?.innerText ?? '', flagged: document.querySelectorAll('[data-ocr-table] tbody tr.flag').length, rs: window.__ocrJob.get().rows.filter((r) => !r.ok && r.line && (r.line.reasons.length + r.names.length)).length };");
check("สรุปบอกอ่านครบกับจำนวนภาพที่ควรตรวจ", sum.sum.includes("อ่านครบ 17 ภาพแล้ว") && sum.sum.includes(`${sum.rs} ภาพที่ควรตรวจ`), sum.sum.replace(/\n/g, " "));
check("แถวที่ติดแถบเหลืองเท่าจำนวนที่ควรตรวจ", sum.flagged === sum.rs, `${sum.flagged} กับ ${sum.rs}`);
check("แถบล่างบอกเวลาที่ใช้อ่าน", /อ่าน 17 ภาพ ใช้เวลา \d+:\d\d/.test(sum.foot), sum.foot.replace(/\n/g, " "));
check("ตัวช่วยตรวจ (ตัวสอนเองฐานว่าง) อ่านไม่ตรงจึงถูกชี้ทุกภาพที่มีข้อความ", sum.rs >= 15, `${sum.rs} ภาพ`);
await c.shot(`${SHOT}/02-อ่านครบ.png`);

// ---------- แก้ข้อความ ตัวเอียง ถูกแล้ว ----------
await q("document.querySelector('[data-ocr-table] tbody tr[data-i=\"0\"]').click(); return 1;"); await sleep(400);
const t0 = await job("return j.get().rows[0].text;");
await click("[data-ocr-edit] [aria-label=ตัวเอียง]"); await sleep(300);
check("ปุ่มตัวเอียงไม่ได้เลือกครอบทั้งบรรทัดด้วย <i>", (await job("return j.get().rows[0].text;")) === `<i>${t0}</i>`);
await click("[data-ocr-edit] [aria-label=ตัวเอียง]"); await sleep(300);
check("กดซ้ำเอาแท็กออก", (await job("return j.get().rows[0].text;")) === t0);
await click("[data-ocr-text]"); await c.key("End"); await c.type(" ก"); await sleep(300);
check("พิมพ์ในช่องข้อความแล้วงานเปลี่ยนตาม", (await job("return j.get().rows[0].text;")) === `${t0} ก`);
await job(`j.setText(0, ${JSON.stringify(t0)}); return 1;`);
const before = await q("return document.querySelectorAll('[data-ocr-table] tbody tr.flag').length;");
await click("[data-ocr-ok]"); await sleep(400);
check("ถูกแล้วเอาบรรทัดออกจากจุดที่ต้องตรวจ", (await q("return document.querySelectorAll('[data-ocr-table] tbody tr.flag').length;")) === before - 1 && (await job("return j.get().rows[0].ok;")));
check("แถวที่กดถูกแล้วขึ้นว่าตรวจแล้ว", (await q("return document.querySelector('[data-ocr-table] tbody tr[data-i=\"0\"]').innerText;")).includes("ตรวจแล้ว"));

// ---------- คัดลอกภาพ บันทึกภาพ เฉพาะซับบังคับ ----------
// คัดลอกส่ง dry ไม่แตะคลิปบอร์ดของคนที่ใช้คอม · บันทึกลงโฟลเดอร์ทดสอบแทนกล่องเลือกที่เก็บ แล้วลบตอนจบ
const IMGDIR = "D:/dev/tmp/ชั้นตรวจOCR";
rmSync(IMGDIR, { recursive: true, force: true }); mkdirSync(IMGDIR, { recursive: true });
await q(`window.__ocrImgDry = true; window.__ocrImgTarget = ${JSON.stringify(IMGDIR)}; return 1;`);
// กดถูกแล้วเลื่อนไปจุดถัดไป เลือกแถวแรกกลับมาก่อน
await q("document.querySelector('[data-ocr-table] tbody tr[data-i=\"0\"]').click(); return 1;"); await sleep(400);
await click("[data-ocr-copyimg]");
check("คัดลอกภาพขึ้นผลสำเร็จ (ไม่แตะคลิปบอร์ด)", await waitFor("const s = document.querySelector('[data-ocr-imgst]'); return s?.dataset.ocrImgst === 'ok' && s.innerText.includes('คัดลอกภาพ 1');", 5000));
await click("[data-ocr-saveimg]"); await sleep(800);
await click("[data-ocr-saveimg]"); await sleep(800);
const saved1 = existsSync(`${IMGDIR}/ภาพซับ 1.png`), saved2 = existsSync(`${IMGDIR}/ภาพซับ 1 (2).png`);
check("บันทึกภาพเป็น PNG ชื่อชนต่อท้ายเลข ไม่เขียนทับ", saved1 && saved2 && readFileSync(`${IMGDIR}/ภาพซับ 1.png`).subarray(1, 4).toString() === "PNG", `${saved1} ${saved2}`);
check("ผลบันทึกบอกชื่อไฟล์ที่ได้", (await q("return document.querySelector('[data-ocr-imgst]')?.innerText ?? '';")).includes("ภาพซับ 1 (2).png"));
await q("delete window.__ocrImgDry; delete window.__ocrImgTarget; return 1;");
rmSync(IMGDIR, { recursive: true, force: true });
check("ซับไม่มีซับบังคับ ไม่ขึ้นสวิตช์เฉพาะซับบังคับ", await q("return !document.querySelector('[data-ocr-forced]');"));
check("หัวช่องภาพในช่องแก้อยู่บรรทัดเดียว เวลาอยู่ในคำบอกตอนชี้", await q("const h = document.querySelector('[data-ocr-edit] .ocr-editl .ocr-edhead').getBoundingClientRect().height, t = document.querySelector('[data-ocr-edtitle]'); return h <= 30 && /\\d:\\d\\d\\.\\d\\d/.test(t.title);"));

// ---------- สีพื้นหลังของภาพซับ (BUGS ข้อ 143.2) ----------
const bg0 = await q("return { v: document.documentElement.dataset.ocrImgbg, c: getComputedStyle(document.querySelector('[data-ocr-table] .ocr-line')).backgroundColor, txt: document.querySelector('[data-ocr-bg] button').innerText };");
check("ปุ่มสีพื้นหลังอยู่หัวคอลัมน์ภาพ ตั้งต้นพื้นเทา", bg0.v === "gray" && bg0.txt.includes("พื้นเทา"), JSON.stringify(bg0));
const bgBox = await q("const b = document.querySelector('[data-ocr-bg] button').getBoundingClientRect(), th = b && document.querySelector('[data-ocr-bg]').closest('th').getBoundingClientRect(); return b.top >= th.top - 0.5 && b.bottom <= th.bottom + 0.5 && b.right <= th.right;");
check("ปุ่มสีพื้นหลังไม่ล้นหัวตาราง", bgBox);
for (const [name, v] of [["ดำ", "dark"], ["ขาว", "white"], ["ลายตาราง", "check"], ["เทา", "gray"]]) {
  await click("[data-ocr-bg] button"); await sleep(400);
  await q(`const o = [...document.querySelectorAll('[role=option]')].find((b) => b.innerText.trim() === ${JSON.stringify(name)}); o?.setAttribute('data-pick-bg', ''); return 1;`);
  await click("[data-pick-bg]"); await sleep(400);
  const r = await q("return { v: document.documentElement.dataset.ocrImgbg, saved: localStorage.getItem('ms.ocrImgBg'), c: getComputedStyle(document.querySelector('[data-ocr-table] .ocr-line')).background };");
  check(`เลือกพื้น${name} ภาพในตารางเปลี่ยนและจำไว้`, r.v === v && r.saved === v && (v !== "dark" || r.c !== bg0.c), r.v);
  if (v === "dark") await c.shot(`${SHOT}/08-พื้นดำ.png`, "[data-ocr-table]");
}

// ---------- ค้นและแทนที่ ----------
const w0 = await job("return j.get().rows[1].text.split(/\\s/)[0];");
await click("[data-ocr-find-open]");
await waitFor("return !!document.querySelector('[data-ocr-find-dlg]');", 3000);
await click("[data-find-a]"); await c.type(w0); await sleep(200);
const hitsTxt = await q("return document.querySelector('[data-find-status]').innerText;");
await click("[data-find-b]"); await c.type("ทดแทน"); await click("[data-find-run]"); await sleep(300);
check("ค้นและแทนที่ แทนคำในบรรทัดที่เจอ บอกจำนวน", (await job("return j.get().rows[1].text;")).includes("ทดแทน") && /เจอใน \d+ บรรทัด/.test(hitsTxt) && (await q("return document.querySelector('[data-find-status]').innerText;")).startsWith("แทนที่แล้ว"), hitsTxt);
await c.key("Escape"); await sleep(300);
await job("const r = j.get().rows[1]; j.setText(1, r.line.text); return 1;");

// ---------- นำข้อความจากไฟล์ซับ (ไฟล์ต้นทางของ th.sup เวลาตรงกันทุกภาพ) ----------
await q(`window.__ocrImport = ${JSON.stringify("D:/movie-shelf/test-media/src/ocr/th.ass")}; return 1;`);
const keep = await job("return j.get().rows.map((r) => r.text);");
await job("j.get().rows.forEach((r, i) => j.setText(i, '')); return 1;");
await click("[data-ocr-import]"); await sleep(1500);
const imp = await job("return j.get().rows.map((r) => r.text);");
check("นำข้อความจากไฟล์ซับใส่ทุกบรรทัดตามเวลา (ล้างข้อความก่อนนำเข้า)", imp.filter((t) => t).length === imp.length && !(await q("return !!document.querySelector('[data-ocr-import-err]');")), imp[0]);
await job(`const k = ${JSON.stringify(keep)}; k.forEach((t, i) => j.setText(i, t)); return 1;`);
await q("delete window.__ocrImport; return 1;");

// ---------- แบบตรวจทีละจุด ----------
await q("[...document.querySelectorAll('[data-ocr-sum] .seg button')].find((b) => b.innerText.includes('ทีละจุด')).click(); return 1;"); await sleep(600);
const one = await q("return { list: document.querySelectorAll('[data-ocr-one] .ocr-onelist .ocr-eitem').length, flagged: window.__ocrJob.get().rows.filter((r) => !r.ok && r.line && (r.line.reasons.length + r.names.length)).length, img: !!document.querySelector('[data-ocr-one] .ocr-screen img') };");
check("แบบทีละจุดมีรายการเท่าจุดที่ต้องตรวจ และภาพบนจอ", one.list === one.flagged && one.img, JSON.stringify(one));
await click("[data-ocr-oknext]"); await sleep(500);
check("ถูกแล้วไปจุดถัดไป รายการลดหนึ่ง", (await q("return document.querySelectorAll('[data-ocr-one] .ocr-onelist .ocr-eitem').length;")) === one.list - 1);
check("ปุ่มสอนตัวอักษรกดไม่ได้เมื่อตัวหลักเป็น PaddleOCR พร้อมเหตุผล", await q("const b = [...document.querySelectorAll('[data-ocr-one] button')].find((x) => x.innerText.includes('สอนตัวอักษร')); return b?.getAttribute('aria-disabled') === 'true' && b.title.includes('nOCR');"));
await c.shot(`${SHOT}/03-ทีละจุด.png`);
await q("[...document.querySelectorAll('[data-ocr-sum] .seg button')].find((b) => b.innerText.includes('ตาราง')).click(); return 1;"); await sleep(500);
check("จำแบบตรวจทานล่าสุด", (await q("return localStorage.getItem('ms.ocrView');")) === "table");

// ---------- หน้าต่างสอนตัวอักษร ฐาน nOCR ว่าง ----------
await job(`j.setCfg({ engine: 'nocr', nocrDb: ${JSON.stringify(DB)}, fix: false, teach: true, helpers: [] }); return 1;`);
await job("j.start([0]); return 1;");
check("ฐานว่างอ่านแล้วขึ้นหน้าต่างสอน", await waitFor("return !!document.querySelector('[data-ocr-teach-dlg]') && !!window.__ocrJob.get().teach;", 15000));
const t1 = await job("const t = j.get().teach; return { letter: t.letter, exp: t.expandMax, title: document.querySelector('.dlg h2, .dlg .ttl, .dlg header')?.innerText ?? '' };");
check("หัวหน้าต่างบอกภาพ ตัวที่ และฐาน", /สอนตัวอักษร ภาพที่ 1 ตัวที่ 1 จาก \d+ ฐาน ตรวจหน้าOCR/.test(await q("return document.querySelector('.dlg')?.innerText ?? '';")));
check("ปุ่มหดกรอบกดไม่ได้ตอนกรอบเหลือชิ้นเดียว", await q("return document.querySelector('[data-teach-shrink]').getAttribute('aria-disabled') === 'true';"));
await c.shot(`${SHOT}/04-สอนตัวอักษร.png`);
await click("[data-teach-text]"); await c.type("ก"); await sleep(200);
await click("[data-teach-learn]");
check("จำตัวนี้แล้วถามตัวถัดไป ไม่ถามตัวที่สอนแล้ว", await waitFor(`const t = window.__ocrJob.get().teach; return !!t && t.letter > ${t1.letter};`, 15000));
const dbs = await q("return await window.__TAURI_INTERNALS__.invoke('ocr_dbs');");
check("ฐานที่สอนไปอยู่ในรายชื่อฐาน", dbs.nocr.includes(DB), JSON.stringify(dbs.nocr));
const l2 = await job("return j.get().teach.letter;");
await click("[data-teach-skip]");
check("ข้ามใส่ * แล้วถามตัวถัดไป", await waitFor(`const t = window.__ocrJob.get().teach; return !!t && t.letter > ${l2};`, 15000));
await click("[data-teach-text]"); await c.type("x"); await sleep(200);
await click("[data-teach-once]");
check("ใช้ครั้งเดียวแล้วอ่านต่อ", await waitFor("const g = window.__ocrJob.get(); return !!g.teach || !g.running;", 15000));
await click("[data-teach-stop]");
check("หยุดอ่านปิดหน้าต่าง งานหยุด ภาพกลับเป็นรออ่าน", await waitFor("const g = window.__ocrJob.get(); return !g.running && !g.teach && !document.querySelector('[data-ocr-teach-dlg]') && g.rows[0].state !== 'work';", 8000));
// แถบล่างตอนอ่านแล้วบางภาพ ปุ่มครบเก้าปุ่ม · เดิมปุ่มอ่านต่อที่เหลือล้นขวา 47 จุด ข้อความสถานะถูกบีบกว้างศูนย์
await sleep(400);
const foot = await q(`const f = document.querySelector('[data-ocr-foot]'), fr = f.getBoundingClientRect(), ks = [...f.children].filter((k) => k.getBoundingClientRect().width > 0);
  const st = f.querySelector(':scope > .small'), bs = ks.filter((k) => k.tagName === 'BUTTON').map((k) => k.getBoundingClientRect());
  return { over: f.scrollWidth - f.clientWidth, right: Math.round(Math.max(...ks.map((k) => k.getBoundingClientRect().right)) - fr.right), lap: bs.filter((a, i) => bs.some((b, j) => j !== i && a.left < b.right - 0.5 && b.left < a.right - 0.5)).length,
    status: st ? Math.round(st.getBoundingClientRect().width) : 0, statusNeed: st ? st.scrollWidth - st.clientWidth : 0, buttons: bs.length, start: !!f.querySelector('[data-ocr-start]'), icon: getComputedStyle(f.querySelector('[data-ocr-import] .ocr-tl')).display };`);
check("แถบล่างตอนปุ่มครบไม่ล้น ปุ่มไม่ซ้อน ข้อความสถานะเห็นครบ ที่ 1280 × 800", foot.start && foot.buttons === 7 && foot.over <= 0 && foot.right <= 0 && foot.lap === 0 && foot.status > 60 && foot.statusNeed <= 0, JSON.stringify(foot));
check("แถบล่างแคบกว่า 1,280 จุด ปุ่มเครื่องมือเหลือไอคอน", foot.icon === "none", foot.icon);
const hist = await q("return await window.__TAURI_INTERNALS__.invoke('ocr_history');");
check("ประวัติที่สอนมีตัวที่จำ", hist.some((h) => h.text === "ก" && h.db === DB), JSON.stringify(hist.slice(0, 3)));

// ---------- หน้าต่างแต่งภาพ ตัวอ่านและชุดภาษา ตัวเลือก ----------
await job("j.setCfg({ engine: 'paddle', fix: true }); return 1;");
const sizes = [];
for (const [btn, sel, name] of [["[data-ocr-prep-open]", "[data-ocr-prep-dlg]", "05-แต่งภาพ"], ["[data-ocr-models-open]", "[data-ocr-models-dlg]", "06-ตัวอ่านและชุดภาษา"], ["[data-ocr-options-open]", "[data-ocr-options-dlg]", "07-ตัวเลือก"]]) {
  await click(btn);
  const ok = await waitFor(`return !!document.querySelector('${sel}');`, 5000);
  await sleep(1500);
  const m = await q(`const d = document.querySelector('.dlg').getBoundingClientRect(), b = document.querySelector('${sel}'); return { w: Math.round(d.width), h: Math.round(d.height), scroll: b.scrollHeight - b.clientHeight, prev: !!document.querySelector('[data-prep-preview] img') };`);
  sizes.push(m);
  check(`${name.slice(3)} เปิดได้ ไม่ต้องเลื่อน`, ok && m.scroll <= 0, JSON.stringify(m));
  if (name.includes("แต่งภาพ")) check("ภาพที่ส่งให้ตัวอ่านมาจาก Rust", m.prev);
  if (name.includes("ตัวเลือก")) {
    // ตัดบรรทัดเอง (ocrbreak.rs) ค่าตั้งต้นเปิดแบบ DoAutoBreak ของ Subtitle Edit · กดแล้วค่าตั้งเปลี่ยนจริง แล้วคืน
    const sw = "[data-ocr-options-dlg] [role=switch][aria-label='ตัดบรรทัดเอง']";
    const before = await job("return j.get().cfg.autoBreak;");
    check("สวิตช์ตัดบรรทัดเองมี ค่าตั้งต้นเปิด", (await q(`return document.querySelector("${sw}")?.getAttribute('aria-checked');`)) === "true" && before === true, String(before));
    await click(sw);
    const off = await job("return j.get().cfg.autoBreak;");
    await click(sw);
    check("กดสวิตช์ตัดบรรทัดเองแล้วค่าตั้งเปลี่ยน กดอีกครั้งคืน", off === false && (await job("return j.get().cfg.autoBreak;")) === true, String(off));
  }
  await c.shot(`${SHOT}/${name}.png`);
  await c.key("Escape");
  check(`${name.slice(3)} กด Esc ปิด`, await waitFor(`return !document.querySelector('${sel}');`, 3000));
}
check("หน้าต่างซ้อนทุกหน้าต่างขนาดเท่ากัน", sizes.every((s) => s.w === sizes[0].w && s.h === sizes[0].h), JSON.stringify(sizes.map((s) => `${s.w}×${s.h}`)));

// ---------- คำที่ไม่รู้จักระหว่างอ่าน (ซับ ACCA ไม่บันทึกภาพ) ----------
if (ACCA) {
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(ACCA)}); return 1;`);
  // หน้ายังอยู่ในงาน OCR ต่อจากไฟล์ก่อน หน้า OCR ขึ้นเลย ไม่ต้องกดปุ่มเปิด
  await waitFor("return !!document.querySelector('[data-ocr-open]') || !!document.querySelector('[data-ocr-page]');", 60000);
  check("เปิดไฟล์อื่นตอนอยู่ในงาน OCR หน้า OCR ขึ้นต่อเลย", await q("return !!document.querySelector('[data-ocr-page]') && !document.querySelector('[data-subviewer-inline]');"));
  await waitFor("return document.querySelectorAll('[data-ocr-table] tbody tr').length === 439;", 120000);
  // อ่าน 12 ภาพแรกโดยไม่ถาม หาภาพแรกที่มีคำที่ไม่รู้จัก แล้วอ่านภาพนั้นใหม่แบบถามทีละคำ
  // ทดสอบด้วยปุ่มข้ามทุกที่ซึ่งไม่จำถาวร ตัวตรวจรันซ้ำได้ (เพิ่มชื่อกับเพิ่มพจนานุกรมจำลงไฟล์ของผู้ใช้ คำที่เคยเพิ่มจะไม่ถูกถามอีก)
  await job("j.setCfg({ engine: 'paddle', paddle: { lang: '', size: 'small', vertical: 'auto', orientation: false }, helpers: [], fix: true, lang3: 'eng', dict: 'en_US' }); j.setPrompt(false); j.start([0,1,2,3,4,5,6,7,8,9,10,11]); return 1;");
  await waitFor("const g = window.__ocrJob.get(); return !g.running && g.rows.slice(0, 12).every((r) => r.state === 'done');", 60000);
  const hit = await job("const k = j.get().rows.findIndex((r) => r.line && r.line.unknown.length); return k < 0 ? null : { k, w: j.get().rows[k].line.unknown[0] };");
  check("ACCA 12 ภาพแรกมีคำที่ไม่รู้จัก", !!hit, JSON.stringify(hit));
  if (hit) {
    await job(`j.setPrompt(true); j.start([${hit.k}]); return 1;`);
    check(`ถามคำที่ไม่รู้จัก ${hit.w} ระหว่างอ่าน`, await waitFor(`const a = window.__ocrJob.get().ask; return !!a && a.word === ${JSON.stringify(hit.w)} && !!document.querySelector('[data-ocr-unknown-dlg]');`, 20000));
    check("ช่องเปลี่ยนเป็นตั้งต้นเป็นคำเดิม", (await q("return document.querySelector('[data-unk-to]')?.value;")) === hit.w);
    await click("[data-unk-skipall]");
    check("ข้ามทุกที่แล้วอ่านจบ คำนั้นไม่ติดเหตุแล้ว", await waitFor(`const g = window.__ocrJob.get(); return !g.running && !g.ask && g.rows[${hit.k}].state === 'done' && !g.rows[${hit.k}].line.unknown.includes(${JSON.stringify(hit.w)});`, 10000));
  }
  await job("j.setPrompt(false); return 1;");
} else console.log("ข้าม คำที่ไม่รู้จักระหว่างอ่าน ไม่ได้ตั้ง MOVIE_SHELF_OCR_SUP");

// ---------- คืนค่า ----------
await q(`await window.__TAURI_INTERNALS__.invoke('ocr_db_delete', { kind: 'nocr', name: ${JSON.stringify(DB)} }); return 1;`).catch((e) => console.log("ลบฐานทดสอบไม่ได้", e.message));
check("ลบฐานทดสอบลงถังขยะแล้ว", !(await q("return (await window.__TAURI_INTERNALS__.invoke('ocr_dbs')).nocr;")).includes(DB));
check("ฐานที่แนบมาลบไม่ได้", await q("try { await window.__TAURI_INTERNALS__.invoke('ocr_db_delete', { kind: 'nocr', name: 'Latin' }); return false; } catch (e) { return String(e).includes('แนบมา'); }"));
await q(`const s = ${JSON.stringify(saved)}; for (const [k, v] of [['ms.ocrCfg', s.cfg], ['ms.ocrPrompt', s.prompt], ['ms.ocrView', s.view], ['ms.ocrImgBg', s.bg]]) { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } window.__subClear(); return 1;`);
await q("location.reload(); return 1;").catch(() => {});
const bad = results.filter((x) => !x).length;
console.log(`\nผ่าน ${results.length - bad} จาก ${results.length} ข้อ`);
process.exit(bad ? 1 : 0);
