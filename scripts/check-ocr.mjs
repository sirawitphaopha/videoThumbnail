// หน้า OCR ซับรูป (แผน OCR ขั้น 11 · BUGS ข้อ 143 · src/pages/ocr/OcrPage.tsx OcrDialogs.tsx lib/ocrJob.ts ocrjob.rs)
// ตรวจ ปุ่มเปิด OCR ข้างปุ่มแปลงซับภาพ · ปุ่มเลือกงานสามแบบ · แถวเลือกตัวอ่านไม่ล้นไม่ซ้อน · อ่านจริงทั้งไฟล์ด้วย PaddleOCR ไทย ความคืบหน้า สรุป
//   · แก้ข้อความ ตัวเอียง ถูกแล้ว · แบบตรวจทีละจุด · หน้าต่างสอนตัวอักษรกับฐาน nOCR ว่าง (ขยายกรอบ จำ ข้าม ใช้ครั้งเดียว หยุด) ฐานลงโฟลเดอร์ผู้ใช้แล้วลบลงถังขยะตอนจบ
//   · หน้าต่างแต่งภาพ ตัวอ่านและชุดภาษา ตัวเลือก ขนาดเท่ากัน ไม่ต้องเลื่อน Esc ปิด · ภาพหลังแต่งจาก Rust · ระยะใต้แถวบน กรอบลงถึงล่างหน้าต่าง
//   · ตั้ง MOVIE_SHELF_OCR_SUP (ซับ ACCA) ตรวจหน้าต่างคำที่ไม่รู้จักระหว่างอ่านเพิ่ม ภาพของไฟล์นี้ไม่บันทึก (ห้ามขึ้น git)
// ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-ocr.mjs · ตอนพี่กันทำงานอยู่ส่ง NOGATE=1
// คืนค่าตั้ง OCR แบบตรวจทาน และการถามคำที่ไม่รู้จักเป็นค่าเดิมตอนจบ · ล้างหน้าซับไตเติลก่อนและหลัง · ภาพลง docs/report-2026-11-16/OCR-ขั้น11/
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";

const NOGATE = process.env.NOGATE === "1";
const gate = () => { if (NOGATE) return; try { execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/fg-gate.ps1"], { stdio: "ignore" }); } catch { console.log("หน้าต่างชั้นหนังอยู่หน้าสุดของจอ หยุดตรวจ"); process.exit(2); } };
gate();
const TH = "D:/movie-shelf/test-media/สร้าง/ocr/th.sup";
const ACCA = process.env.MOVIE_SHELF_OCR_SUP?.replace(/\\/g, "/");
const SHOT = "docs/report-2026-11-16/OCR-ขั้น11";
const SHOT12 = "docs/report-2026-11-17/OCR-ขั้น12";
const DB = "ตรวจหน้าOCR";
mkdirSync(SHOT, { recursive: true });
mkdirSync(SHOT12, { recursive: true });

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(200); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click(); return 1;`);
const click = async (sel) => { gate(); await c.click(sel); };
const job = (js) => q(`const j = window.__ocrJob; ${js}`);
// กล่อง ⓘ ที่เพิ่มตอนแก้ผลผู้ช่วยตรวจทาน U16 ตรวจจุดตัดบรรทัดทุกย่อหน้า · DUMP=1 พิมพ์จุดตัดไว้อ่านแล้วแก้ตาราง TIPS
const DUMP = process.env.DUMP === "1";
const { linesOf } = await import("./lib/lines.mjs");
// จุดตัดที่คาดไว้ที่หน้าต่าง 1280 × 800 อ่านเองทุกย่อหน้าแล้ว 17 พ.ย. 2569
const TIPS = {
  "PaddleOCR": ["PaddleOCR เป็นโมเดล AI อ่านตัวหนังสือจากภาพ ⏎ และทำงานในเครื่องทั้งหมด", "ONNX Runtime ตัวรันโมเดล AI บนซีพียูของ Microsoft ⏎ ชั้นหนังใช้ตัวนี้รันโมเดลของ PaddleOCR", "PP-OCRv6 รุ่นล่าสุด อ่านอังกฤษ ญี่ปุ่น และจีนได้ในโมเดลเดียว ⏎ มีสามขนาด tiny small และ medium", "PP-OCRv5 โมเดลแยกตามภาษา ใช้กับภาษาที่ PP-OCRv6 ไม่มี ⏎ เช่นไทย เกาหลี และรัสเซีย"],
  "ชุดภาษาของ Tesseract": ["ชุดภาษาคือไฟล์ที่สอน Tesseract ให้รู้จักตัวอักษรของภาษานั้น ⏎ โดยภาษาละหนึ่งไฟล์", "แนบมา อังกฤษ ไทย ญี่ปุ่นแนวนอนกับแนวตั้ง ⏎ และไฟล์หาทิศทางภาพ มากับตัวติดตั้งแล้ว", "tessdata_best ชุดภาษาแบบแม่นที่สุดของโครงการ Tesseract ⏎ ภาษาอื่นโหลดเพิ่มจากชุดนี้ ไฟล์ใหญ่กว่าแบบเร็วแต่อ่านแม่นกว่า"],
  "ตัวเลือกการอ่าน": ["ตัวเลือกที่ใช้ตอนอ่าน ค่าที่ตั้งจำไว้ในเครื่อง ใช้กับการอ่านครั้งต่อไป", "แก้คำ OCR แก้คำที่ตัวอ่านมักอ่านผิด เช่นขีดตั้งที่ควรเป็นตัว I ⏎ ด้วยรายการแก้คำของ Subtitle Edit และพจนานุกรม", "เดาคำที่ไม่รู้จัก คำที่พจนานุกรมไม่รู้จัก ลองเปลี่ยนตัวที่มักอ่านผิด ⏎ จนได้คำที่รู้จัก", "ถามคำที่ไม่รู้จักทีละคำ หยุดถามคำที่ไม่รู้จักระหว่างอ่าน ⏎ ปิดไว้แล้วตรวจจากรายการหลังอ่านได้", "หยุดสอนตัวที่ไม่รู้จัก เจอตัวที่ฐานไม่รู้จักแล้วเปิดหน้าต่างสอน ⏎ ปิดไว้จะใส่ * แทน", "ฐานสำรอง nOCR อ่านไม่ออกให้ Binary OCR ลอง หรือกลับกัน", "ลองบิดตัวเอียง ตัวที่จับคู่กับฐานไม่ได้ บิดภาพให้ตั้งตรงแล้วเทียบใหม่ ⏎ ถ้าตรงจะนับเป็นตัวเอียง ⏎ ข้อดีอ่านซับตัวเอียงได้โดยไม่ต้องสอนตัวเอียงแยก ⏎ ข้อเสียช้าลงเล็กน้อย", "เดาตัวที่ใกล้ที่สุด ตัวที่ฐานไม่รู้จัก ใช้ตัวที่หน้าตาใกล้ที่สุดในฐานแทน ⏎ ไม่หยุดเปิดหน้าต่างสอน ⏎ ข้อดีอ่านจบรวดเดียว ⏎ ข้อเสียตัวที่เดาอาจผิด ต้องตรวจทานเอง", "ตัดบรรทัดเอง เกินสองบรรทัดจะตัดใหม่ให้เหลือสองบรรทัด ⏎ บรรทัดละไม่เกิน 43 ตัว โดยบรรทัดล่างยาวกว่าเล็กน้อย ⏎ ข้อดีบทพูดสองคนที่ขึ้นด้วยขีด เพลงที่มี ♪ ⏎ และป้ายบนจอที่แยกจากบทพูดข้างล่าง ไม่ถูกตัดใหม่"],
  "วิธีวาดเส้น": ["วิธีที่โปรแกรมเลือกตำแหน่งเส้นเทียบตอนสอนตัวอักษรหนึ่งตัว ⏎ แบบเดียวกับหน้าต่างสอนของ Subtitle Edit", "สุ่มเส้น สุ่มเส้นตั้ง เส้นนอน และเส้นเอียงหลายความยาว ⏎ แล้วเก็บเส้นที่ทับตัวอักษรหรือพื้นจริง ⏎ ข้อดีค่าตั้งต้นของ Subtitle Edit ใช้ได้กับทุกฟอนต์", "ตามโครงตัวอักษร หาแกนกลางของตัวอักษรแล้ววางเส้นตามแกน ⏎ ข้อดีแยกตัวที่เส้นบางและคล้ายกันได้ดี ⏎ ข้อเสียตัวเล็กมากจะกลับไปใช้สุ่มเส้น", "ตามขอบตัวอักษร หาเส้นตรงที่ยาวที่สุด ⏎ ทั้งบนตัวอักษรและบนพื้นรอบตัว ⏎ ข้อดีเหมาะกับฟอนต์ที่มีเส้นตรงชัด ⏎ ข้อเสียตัวโค้งมากได้เส้นน้อย", "แนะนำสุ่มเส้น"],
  "เปอร์เซ็นต์ผิดสูงสุด": ["Binary OCR เทียบภาพตัวอักษรกับภาพในฐานทีละจุด ⏎ ค่านี้คือเปอร์เซ็นต์ของจุดที่ต่างได้มากสุดที่ยังนับเป็นตัวเดียวกัน", "แนะนำใช้ค่าตั้งต้นก่อน ถ้าหยุดสอนบ่อยจึงค่อยเพิ่มทีละน้อย ⏎ ตั้งสูงไปตัวที่คล้ายกันจะอ่านสลับกัน"],
};
const tipCheck = async (scope, title) => {
  const sel = `${scope} .infob[data-info="${title}"]`;
  if (!(await q(`return !!document.querySelector(${JSON.stringify(sel)});`))) { check(`ผู้ช่วยตรวจทาน U16 มีปุ่ม ⓘ ${title}`, false); return; }
  await q(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' }); return 1;`);
  await sleep(120);
  await click(sel); await sleep(350);
  const got = await linesOf(q, `.infotip[data-tip="${title}"]`);
  await c.key("Escape"); await sleep(200);
  if (DUMP) { console.log(`TIP ${JSON.stringify(title)}: ${JSON.stringify(got)},`); return; }
  const want = TIPS[title];
  if (!want) { check(`ผู้ช่วยตรวจทาน U16 กล่อง ⓘ ${title} มีค่าที่คาดไว้ในตัวตรวจ`, false, JSON.stringify(got)); return; }
  const bad = (got ?? []).filter((l, i) => l !== want[i]);
  check(`ผู้ช่วยตรวจทาน U16 กล่อง ⓘ ${title} ตัดบรรทัดตรงที่คาดทุกย่อหน้า`, !!got && got.length === want.length && !bad.length, bad.join(" | ") || `${got?.length} ย่อหน้า`);
};

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
// ตัวอ่านแบบเทียบภาพมีปุ่มจัดการฐานเพิ่มในแถว ต้องไม่ล้นไม่ซ้อนทุกแบบ (ชื่อฐานที่ยาวจางท้ายในดรอปดาวน์ได้)
{
  const cfg0 = await job("return JSON.stringify(j.get().cfg);");
  for (const e of ["nocr", "binary", "own"]) {
    await job(`j.setCfg({ engine: '${e}' }); return 1;`); await sleep(250);
    const r2 = await q(`const r = document.querySelector('[data-ocr-engine]'); const kids = [...r.children].map((k) => k.getBoundingClientRect()).filter((b) => b.width > 0);
      let lap = 0; for (let i = 1; i < kids.length; i++) if (kids[i].left < kids[i - 1].right - 0.5) lap++;
      return { over: r.scrollWidth - r.clientWidth, lap, right: Math.max(...kids.map((b) => b.right)), box: r.getBoundingClientRect().right, db: !!document.querySelector('[data-ocr-db-open]') };`);
    check(`แถวเลือกตัวอ่าน ${e} มีปุ่มจัดการฐาน ไม่ล้นไม่ซ้อน`, r2.db && r2.over <= 0 && r2.lap === 0 && r2.right <= r2.box + 0.5, JSON.stringify(r2));
  }
  await job(`j.setCfg(${cfg0}); return 1;`); await sleep(250);
}
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

// ---------- ส่งออกและส่งต่อ (แผน OCR ขั้น 12 · ExportTextAsSubtitle SaveAllImagesWithHtmlIndex Ok ของ Subtitle Edit) ----------
// ข้อความที่รู้คำตอบ ภาพที่ 3 ทำเป็นป้ายบนจอกับบทพูดล่างจอ (แก้ตำแหน่งในที่เก็บงานของรุ่นทดสอบ) · ภาพที่ 5 ไม่มีข้อความ
const EXPDIR = "D:/dev/tmp/ชั้นตรวจส่งออกOCR";
rmSync(EXPDIR, { recursive: true, force: true }); mkdirSync(EXPDIR, { recursive: true });
const keep2 = await job("return j.get().rows.map((r) => r.text);");
await job(`j.get().rows.forEach((r, i) => j.setText(i, 'บรรทัด ' + (i + 1))); const r = j.get().rows[2]; r.line.anLines = [8, 2]; j.setText(2, 'ป้ายบนจอ\\nบทพูด <i>เอียง</i>'); j.setText(4, ''); return 1;`);
await sleep(300);
// ภาพที่มีป้ายบนจอกับบทพูดล่างจอในภาพเดียว ภาพในแถวตัดช่องว่างกลางออก ตัวหนังสือใหญ่พออ่าน · ภาพบรรทัดเดียวไม่ถูกแตะ (เจอจากภาพตรวจขนาดจอหลังขั้น 14)
{
  await waitFor("return document.querySelectorAll('[data-ocr-table] tbody tr')[2]?.querySelector('.ocr-line img')?.dataset.compact === 'true';", 8000);
  const cmp = await q("const rs = document.querySelectorAll('[data-ocr-table] tbody tr'); const im = rs[2]?.querySelector('.ocr-line img'); if (!im) return null; await im.decode().catch(() => {}); const r = im.getBoundingClientRect(); return { cut: im.dataset.compact === 'true', h: im.naturalHeight, orig: window.__ocrJob.get().rows[2].item.h, shownH: Math.round(r.height), row1: rs[0]?.querySelector('.ocr-line img')?.dataset.compact ?? null };");
  check("ภาพป้ายบนจอกับบทพูดในแถวตัดช่องว่างกลางออก สูงไม่ถึงครึ่งของภาพจริง ภาพบรรทัดเดียวไม่ถูกแตะ", cmp && cmp.cut && cmp.h < cmp.orig / 2 && cmp.row1 == null, JSON.stringify(cmp));
  await c.shot(`docs/report-2026-11-17/OCR-ขั้น14/5-ภาพป้ายบนจอในแถว.png`, "[data-ocr-table]").catch(() => {});
  // กล่อง ⓘ ตำแหน่งบนจอในแถวต้องเป็นคำอธิบายของตาราง (POS_TIP ใน tips.tsx) ไม่ใช่ของหน้าต่างส่งออก ที่ชื่อตัวแปรเหมือนกัน
  // (แบ่งไฟล์ขั้น 7.1 OcrTable.tsx เคย import POS_TIP จาก OcrExportDialog ผู้ช่วยตรวจทานขั้น 13.5 เจอ · tsc จับไม่ได้เพราะชนิดเดียวกัน)
  // ป้ายบนจออยู่ในช่องแก้ของแถวที่เลือก เลือกภาพที่ 3 ก่อน
  await q("document.querySelector('[data-ocr-table] tbody tr[data-i=\"2\"]').click(); return 1;"); await sleep(400);
  const posSel = "[data-ocr-edit] .ocr-posnote .infob[data-info=\"ตำแหน่งบนจอ\"]";
  await q(`document.querySelector(${JSON.stringify(posSel)})?.scrollIntoView({ block: 'center' }); return 1;`); await sleep(120);
  await click(posSel).catch(() => {}); await sleep(350);
  const posTip = await q("return document.querySelector('.infotip[data-tip=\"ตำแหน่งบนจอ\"]')?.innerText ?? null;");
  await c.key("Escape"); await sleep(200);
  check("แบ่งไฟล์ 13.5 กล่อง ⓘ ตำแหน่งบนจอในแถวเป็นคำอธิบายของตาราง ไม่ใช่ของหน้าต่างส่งออก", !!posTip && posTip.includes("ซับบางภาพไม่ได้อยู่ล่างจอ") && !posTip.includes("ซับแถวเดียวมีได้ตำแหน่งเดียว"), (posTip ?? "ไม่มีกล่อง").slice(0, 80));
}
// ภาพที่มีบรรทัดบนจอ คิดแบบ lines_of ใน ocrexport.rs · จำนวนบรรทัดไม่เท่าตอนอ่านใช้ตำแหน่งบรรทัดสุดท้าย (ผู้ช่วยตรวจทาน T10)
const topNs = await job("return j.get().rows.filter((r) => { if (r.state !== 'done') return false; const ls = r.text.split('\\n').filter((l) => l.trim()); const an = r.line?.anLines ?? [r.item.an]; const use = an.length === ls.length || an.length <= 1 ? an : [an[an.length - 1]]; return ls.length > 0 && use.some((a) => a >= 7); }).map((r) => r.item.n);");
// แถวที่ตัวตรวจแทนข้อความเป็นบรรทัดเดียว แต่ตอนอ่านมีป้ายบนจอสองบรรทัด ต้องไม่นับว่าอยู่บนจอ (เดิมไฟล์ได้ {\an8} ผิดที่บทพูด)
const t10 = await job("return j.get().rows.filter((r) => r.state === 'done' && r.text.trim() && !r.text.includes('\\n') && (r.line?.anLines ?? []).length > 1 && r.line.anLines[0] >= 7).map((r) => r.item.n);");
check("ผู้ช่วยตรวจทาน T10 แถวที่แก้จนเหลือบรรทัดเดียวไม่ถูกนับเป็นซับบนจอ", t10.length > 0 && t10.every((n) => !topNs.includes(n)), `แถว ${t10.join(",")} บนจอ ${topNs.join(",")}`);
// ชนิดไฟล์ที่จำไว้ (WebVTT) ขึ้นทันทีตอนเปิดหน้าต่าง · เดิมรายชื่อชนิดของ SeConv โหลดตามมาทีหลัง หน้าต่างขึ้น SubRip .srt ก่อนแล้วสลับเอง ตัวตรวจรอบแรกจึงส่งออกผิดชนิด
const expSaved = await q("return localStorage.getItem('ms.ocrExport');");
await q(`localStorage.setItem('ms.ocrExport', JSON.stringify({ fmt: 'WebVTT', top: 'tag', italic: true, enc: 'utf8bom' })); return 1;`);
await click("[data-ocr-export]");
const firstT = await q("return document.querySelector('[data-ocr-exp-target]')?.innerText ?? '';");
check("ขั้น 12 ชนิดไฟล์ที่จำไว้ขึ้นทันทีตอนเปิดหน้าต่าง ไม่ขึ้น SubRip ก่อนแล้วสลับ", firstT.endsWith(".vtt") && await waitFor("return document.querySelector('[data-ocr-exp-text]')?.innerText.startsWith('WEBVTT');", 8000), firstT);
await c.key("Escape"); await sleep(300);
await q("localStorage.removeItem('ms.ocrExport'); return 1;");
const ft = await q("return { exp: !!document.querySelector('[data-ocr-export]'), edit: !!document.querySelector('[data-ocr-to-edit]'), over: (() => { const f = document.querySelector('[data-ocr-foot]'); return f.scrollWidth - f.clientWidth; })() };");
check("ขั้น 12 แถบล่างมีปุ่มไปหน้าแก้ซับกับปุ่มส่งออก ไม่ล้นขวา", ft.exp && ft.edit && ft.over <= 0, JSON.stringify(ft));
await click("[data-ocr-export]");
check("ขั้น 12 กดส่งออกขึ้นหน้าต่างส่งออก ตัวอย่างไฟล์ SRT", await waitFor("return (document.querySelector('[data-ocr-exp-text]')?.innerText ?? '').startsWith('1');", 10000));
const ex = await q(`const d = document.querySelector('[data-ocr-exp]'), l = d.querySelector('.ocr-expl').getBoundingClientRect(), r = d.querySelector('.ocr-expr').getBoundingClientRect(), dlg = d.closest('.dlg').getBoundingClientRect();
  const kids = [...d.querySelectorAll('.ocr-expl > *')].filter((k) => k.getBoundingClientRect().width > 0);
  const wide = kids.filter((k) => k.getBoundingClientRect().right > l.right + 0.5).length;
  return { lap: l.right > r.left + 0.5, wide, rr: Math.round(dlg.right - r.right), top: d.querySelector('[data-ocr-exp-top]')?.innerText.replace(/\\s+/g, ' ') ?? null, skip: d.querySelector('[data-ocr-exp-skip]')?.innerText.replace(/\\s+/g, ' ') ?? null,
    target: d.querySelector('[data-ocr-exp-target]').innerText, text: d.querySelector('[data-ocr-exp-text]').innerText, head: d.querySelector('.ocr-expr .icv-head').innerText.replace(/\\s+/g, ' ') };`);
check("ขั้น 12 สองคอลัมน์ไม่ทับกัน ของในคอลัมน์ตั้งค่าไม่ล้น ฝั่งไฟล์ที่จะได้ชนขอบขวาหน้าต่าง", !ex.lap && ex.wide === 0 && Math.abs(ex.rr) <= 1, JSON.stringify({ lap: ex.lap, wide: ex.wide, rr: ex.rr }));
check("ขั้น 12 เตือนซับบนจอบอกเลขภาพ และบอกภาพที่ไม่มีข้อความไม่ถูกส่งออก", topNs.includes(3) && ex.top?.includes(`มี ${topNs.length} ภาพที่ซับอยู่บนจอ`) && ex.top.includes(`ภาพ ${topNs.length > 1 ? topNs.slice(0, -1).join(", ") + " และ " + topNs.at(-1) : topNs[0]} มี`) && ex.skip?.includes("ไม่มีข้อความ 1 ภาพ"), `${ex.top} | ${ex.skip}`);
check("ขั้น 12 ที่เก็บตั้งต้นข้างไฟล์ซับ ชื่อเดียวกัน นามสกุล .srt", ex.target.replace(/\\/g, "/") === TH.replace(/\.sup$/, ".srt"), ex.target);
check("ขั้น 12 ตัวอย่าง SRT ป้ายบนจอแยกแถวติด {\\an8} เวลาเดียวกับบทพูด ภาพไม่มีข้อความไม่อยู่ในไฟล์ 17 แถว",
  ex.text.includes("{\\an8}ป้ายบนจอ") && ex.text.includes("บทพูด <i>เอียง</i>") && !/บรรทัด 5\r?\n/.test(ex.text) && ex.head.includes(`${16 + 1} แถว`), ex.head);
await c.shot(`${SHOT12}/12-ส่งออก.png`, ".dlg").catch(() => {});
// รวมไว้ล่างจอ · ตัดตัวเอียง
await q("[...document.querySelectorAll('[data-ocr-exp-top] .seg button')].find((b) => b.innerText.includes('รวมไว้ล่างจอ')).click(); return 1;");
await click("[data-ocr-exp] .icv-row [role=switch]");
check("ขั้น 12 รวมไว้ล่างจอได้แถวเดียวไม่มีแท็ก ปิดตัวเอียงแล้วแท็กหาย 16 แถว",
  await waitFor("const t = document.querySelector('[data-ocr-exp-text]').innerText.replace(/\\r/g, ''); return t.includes('ป้ายบนจอ\\nบทพูด เอียง') && !t.includes('{\\\\an8}') && document.querySelector('.ocr-expr .icv-head').innerText.includes('16 แถว');", 5000));
await q("[...document.querySelectorAll('[data-ocr-exp-top] .seg button')].find((b) => b.innerText.includes('แยกแถว')).click(); return 1;");
await click("[data-ocr-exp] .icv-row [role=switch]");
// เขียนจริง เปลี่ยนที่เก็บผ่าน __ocrExpTarget แทนกล่องของ Windows
await q(`window.__ocrExpTarget = ${JSON.stringify(EXPDIR + "/ผลOCR.srt")}; return 1;`);
await click("[data-ocr-exp-pick]");
await click("[data-ocr-exp-go]");
check("ขั้น 12 ส่งออก SRT จริง ขึ้นการ์ดส่งออกแล้ว 17 แถว", await waitFor("return !!document.querySelector('[data-ocr-exp-done]');", 10000) && (await q("return document.querySelector('[data-ocr-exp-done]').innerText;")).includes("17 แถว"));
const srtFile = existsSync(`${EXPDIR}/ผลOCR.srt`) ? readFileSync(`${EXPDIR}/ผลOCR.srt`) : Buffer.alloc(0);
const srtTxt = srtFile.toString("utf8");
check("ขั้น 12 ไฟล์ SRT มี BOM ข้อความตรงทุกบรรทัด ป้ายบนจอติด {\\an8}", srtFile[0] === 0xef && srtTxt.includes("1\r\n") && srtTxt.includes("บรรทัด 17") && srtTxt.includes("{\\an8}ป้ายบนจอ"), String(srtFile.length));
await q("window.__openDry = true; window.__openDryLog = []; return 1;");
await click("[data-ocr-exp-reveal]");
check("ขั้น 12 ปุ่มเปิดโฟลเดอร์ส่งที่อยู่ไฟล์ที่ส่งออก", (await q("return window.__openDryLog[0] ?? '';")).replace(/\\/g, "/").endsWith("ผลOCR.srt"));
await click("[data-ocr-exp-go]");
check("ขั้น 12 ส่งออกซ้ำชื่อเดิม ไม่ทับไฟล์ ขึ้นการ์ดชื่อซ้ำ", await waitFor("return !!document.querySelector('[data-ocr-exp-exists]');", 8000));
await click("[data-ocr-exp-renum]");
check("ขั้น 12 ตั้งชื่อใหม่ต่อเลขท้าย ได้ไฟล์ที่สอง", await waitFor("return !!document.querySelector('[data-ocr-exp-done]');", 8000) && existsSync(`${EXPDIR}/ผลOCR (2).srt`));
// ชนิดของ SeConv · ค้นในดรอปดาวน์ แล้วตัวอย่างเป็น WebVTT
await click("[data-ocr-exp-fmt] button");
await q("const i = document.querySelector('.ddsearch input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'webvtt'); i.dispatchEvent(new Event('input', { bubbles: true })); return 1;");
await sleep(300);
await q("[...document.querySelectorAll('.ddmenu [role=option], .ddlist [role=option], [role=listbox] [role=option]')].find((o) => o.innerText.startsWith('WebVTT'))?.click(); return 1;");
check("ขั้น 12 เลือก WebVTT จากชนิดของ Subtitle Edit ตัวอย่างขึ้นต้นด้วย WEBVTT ที่เก็บเปลี่ยนเป็น .vtt",
  await waitFor("return document.querySelector('[data-ocr-exp-text]')?.innerText.startsWith('WEBVTT') && document.querySelector('[data-ocr-exp-target]').innerText.endsWith('.vtt');", 10000),
  await q("return document.querySelector('[data-ocr-exp-target]').innerText + ' | ' + (document.querySelector('[data-ocr-exp-text]')?.innerText ?? '').slice(0, 20);"));
await click("[data-ocr-exp-go]");
const vttOk = await waitFor("return !!document.querySelector('[data-ocr-exp-done]');", 15000);
const vttPath = `${EXPDIR}/ผลOCR (2).vtt`;
const vttTxt = existsSync(vttPath) ? readFileSync(vttPath, "utf8") : "";
check("ขั้น 12 ส่งออก WebVTT จริงผ่าน SeConv (ชื่อตามที่เก็บที่ตั้งใหม่ล่าสุด)", vttOk && vttTxt.startsWith("﻿WEBVTT") && vttTxt.includes("ป้ายบนจอ"), vttTxt.slice(0, 30));
// ภาพพร้อมหน้า HTML ลงโฟลเดอร์ใหม่ ผ่าน __ocrHtmlFolder แทนกล่องเลือกโฟลเดอร์
await q(`window.__ocrHtmlFolder = ${JSON.stringify(EXPDIR)}; return 1;`);
await click("[data-ocr-html-go]");
check("ขั้น 12 บันทึกภาพพร้อมหน้า HTML 17 ภาพลงโฟลเดอร์ใหม่", await waitFor("return !!document.querySelector('[data-ocr-html-done]');", 15000) && (await q("return document.querySelector('[data-ocr-html-done]').innerText;")).includes("17 ภาพ"));
const seen = await q("const c = document.querySelector('[data-ocr-html-done]').getBoundingClientRect(), b = document.querySelector('.ocr-expl').getBoundingClientRect(), t = document.querySelector('[data-ocr-exp-target]').innerText; return { inside: c.top >= b.top - 0.5 && c.bottom <= b.bottom + 0.5, slash: t.includes('/') };");
check("ขั้น 12 การ์ดผลบันทึกภาพเลื่อนเข้ามาให้เห็นเอง ที่อยู่ไฟล์ใช้ทับแบบ Windows แบบเดียว", seen.inside && !seen.slash, JSON.stringify(seen));
const htmlFile = `${EXPDIR}/th OCR/index.html`;
const htmlTxt = existsSync(htmlFile) ? readFileSync(htmlFile, "utf8") : "";
check("ขั้น 12 หน้า HTML มีภาพครบ ข้อความเข้ารหัสแล้ว ภาพไม่มีข้อความติดป้าย", existsSync(`${EXPDIR}/th OCR/images/0017.png`) && htmlTxt.includes("ป้ายบนจอ<br />บทพูด <i>เอียง</i>") && htmlTxt.includes("ภาพนี้ยังไม่มีข้อความ") && htmlTxt.includes("17 ภาพ ไม่มีข้อความ 1 ภาพ"), String(htmlTxt.length));
await c.shot(`${SHOT12}/13-ส่งออก-ผล.png`, ".dlg").catch(() => {});
await q("delete window.__ocrExpTarget; delete window.__ocrHtmlFolder; return 1;");
await c.key("Escape");
check("ขั้น 12 Esc ปิดหน้าต่างส่งออก", await waitFor("return !document.querySelector('[data-ocr-exp]');", 3000));
// ไปหน้าแก้ซับ · เอกสาร ASS 17 แถว แก้กับวิดีโอได้ · กลับมา OCR แล้วกดอีกครั้ง ถามก่อนแทนที่ที่แก้ค้าง
await click("[data-ocr-to-edit]");
check("ขั้น 12 ไปหน้าแก้ซับ เปิดผล OCR เป็น ASS 17 แถว ปุ่มแก้ซับกับวิดีโอกดได้และถูกเลือก",
  await waitFor("return document.querySelector('[data-subedit][data-se-kind=ass]') && document.querySelector('[data-se-count]')?.innerText.startsWith('17 บรรทัด');", 15000)
  && await q("const b = [...document.querySelectorAll('[data-sub-mode] button')][2]; return b.getAttribute('aria-pressed') === 'true' && b.getAttribute('aria-disabled') !== 'true';"));
const ed = await q("const s = window.__subEdit.get(); return { dirty: s.dirty, name: s.meta?.name, an8: s.doc.events.filter((e) => e.text.startsWith('{\\\\an8}')).length, res: s.doc.skeleton.filter((i) => i.t && i.t.startsWith('PlayRes')).map((i) => i.t).join(',') };");
check("ขั้น 12 เอกสารยังไม่บันทึก ชื่อ th OCR ป้ายบนจอเก็บ {\\an8} ขนาดภาพตามจอของซับรูป", ed.dirty && ed.name === "th OCR" && ed.an8 === topNs.length && ed.res.includes("PlayResX"), JSON.stringify(ed));
await c.shot(`${SHOT12}/14-หน้าแก้ซับ.png`, "[data-subedit]").catch(() => {});
await q("[...document.querySelectorAll('[data-sub-mode] button')][1].click(); return 1;");
await waitFor("return !!document.querySelector('[data-ocr-to-edit]');", 8000);
await click("[data-ocr-to-edit]");
check("ขั้น 12 ส่งซ้ำตอนหน้าแก้ซับยังไม่บันทึก ถามก่อน มีปุ่มไปหน้าแก้ซับเดิมกับแทนที่", await waitFor("return !!document.querySelector('[data-ocr-edit-old]') && !!document.querySelector('[data-ocr-edit-replace]');", 5000));
await click("[data-ocr-edit-old]");
check("ขั้น 12 ไปหน้าแก้ซับเดิม เอกสารเดิมไม่ถูกแทน", await waitFor("return !!document.querySelector('[data-subedit][data-se-kind=ass]');", 8000));
// คืน · ปิดเอกสาร กลับหน้า OCR คืนข้อความเดิม
await q("window.__subEdit.closeDoc(); return 1;");
await waitFor("return [...document.querySelectorAll('[data-sub-mode] button')][2]?.getAttribute('aria-disabled') === 'true';", 5000);
await q("[...document.querySelectorAll('[data-sub-mode] button')][1].click(); return 1;");
await waitFor("return !!document.querySelector('[data-ocr-table]');", 8000);
await job(`const k = ${JSON.stringify(keep2)}; k.forEach((t, i) => j.setText(i, t)); const r = j.get().rows[2]; r.line.anLines = null; return 1;`);
check("ขั้น 12 ปิดเอกสารแล้วปุ่มแก้ซับกับวิดีโอกลับเป็นกดไม่ได้", await q("return [...document.querySelectorAll('[data-sub-mode] button')][2].getAttribute('aria-disabled') === 'true';"));
rmSync(EXPDIR, { recursive: true, force: true });
await q(`${expSaved == null ? "localStorage.removeItem('ms.ocrExport')" : `localStorage.setItem('ms.ocrExport', ${JSON.stringify(expSaved)})`}; window.__openDry = false; return 1;`);

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
// แถบล่างตอนอ่านแล้วบางภาพ ปุ่มครบ · เดิมปุ่มอ่านต่อที่เหลือล้นขวา 47 จุด ข้อความสถานะถูกบีบกว้างศูนย์ · ขั้น 12 เพิ่มปุ่มไปหน้าแก้ซับกับส่งออก รวมเก้าปุ่ม
await sleep(400);
const foot = await q(`const f = document.querySelector('[data-ocr-foot]'), fr = f.getBoundingClientRect(), ks = [...f.children].filter((k) => k.getBoundingClientRect().width > 0);
  const st = f.querySelector(':scope > .small'), bs = ks.filter((k) => k.tagName === 'BUTTON').map((k) => k.getBoundingClientRect());
  return { over: f.scrollWidth - f.clientWidth, right: Math.round(Math.max(...ks.map((k) => k.getBoundingClientRect().right)) - fr.right), lap: bs.filter((a, i) => bs.some((b, j) => j !== i && a.left < b.right - 0.5 && b.left < a.right - 0.5)).length,
    status: st ? Math.round(st.getBoundingClientRect().width) : 0, statusNeed: st ? st.scrollWidth - st.clientWidth : 0, buttons: bs.length, start: !!f.querySelector('[data-ocr-start]'), icon: getComputedStyle(f.querySelector('[data-ocr-import] .ocr-tl')).display };`);
check("แถบล่างตอนปุ่มครบไม่ล้น ปุ่มไม่ซ้อน ข้อความสถานะเห็นครบ ที่ 1280 × 800", foot.start && foot.buttons === 9 && foot.over <= 0 && foot.right <= 0 && foot.lap === 0 && foot.status > 60 && foot.statusNeed <= 0, JSON.stringify(foot));
check("แถบล่างแคบกว่า 1,280 จุด ปุ่มเครื่องมือเหลือไอคอน", foot.icon === "none", foot.icon);
const hist = await q("return await window.__TAURI_INTERNALS__.invoke('ocr_history');");
check("ประวัติที่สอนมีตัวที่จำ", hist.some((h) => h.text === "ก" && h.db === DB), JSON.stringify(hist.slice(0, 3).map((h) => ({ ...h, png: h.png.slice(0, 30) }))));
// หน้าต่างตัวที่สอนไปแล้ว (NOcrCharacterHistoryWindow) เปิดจากหน้าต่างฐาน แก้เป็น ข แล้วฐานเปลี่ยนตาม แล้วแก้คืนเป็น ก
{
  await click("[data-ocr-db-open]");
  await waitFor("return !!document.querySelector('[data-db=history]');", 8000);
  await click("[data-db=history]");
  const okH = await waitFor("return document.querySelectorAll('[data-ocr-hist-dlg] [data-hist-item] img').length > 0;", 8000);
  const hm = await q("const d = [...document.querySelectorAll('.dlg')].pop().getBoundingClientRect(), b = document.querySelector('[data-ocr-hist-dlg]'); return { w: Math.round(d.width), h: Math.round(d.height), scroll: b.scrollHeight - b.clientHeight, img: !!document.querySelector('[data-hist-canvas] img'), text: document.querySelector('[data-hist-text]')?.value };");
  check("หน้าต่างตัวที่สอนไปแล้ว มีภาพตัวที่สอน ขนาดเท่าหน้าต่างอื่น ไม่เลื่อน", okH && hm.img && hm.text === "ก" && hm.w === 880 && hm.scroll <= 0, JSON.stringify(hm));
  await c.shot(`${SHOT}/09-ตัวที่สอนไปแล้ว.png`);
  await q("const t = document.querySelector('[data-hist-text]'); t.focus(); t.select(); return 1;"); await c.type("ข");
  await click("[data-hist-save]");
  await waitFor("return !!document.querySelector('[data-hist-msg]');", 5000);
  const dbH = await q(`return await window.__TAURI_INTERNALS__.invoke('ocr_db_chars', { kind: 'nocr', name: ${JSON.stringify(DB)} });`);
  const hs = await q("return await window.__TAURI_INTERNALS__.invoke('ocr_history');");
  check("แก้จากหน้าต่างตัวที่สอนแล้ว ฐานกับประวัติเป็น ข", dbH.items.some((i) => i.text === "ข") && !dbH.items.some((i) => i.text === "ก") && hs.some((h) => h.text === "ข"), JSON.stringify(dbH.items.map((i) => i.text)));
  await q("const t = document.querySelector('[data-hist-text]'); t.focus(); t.select(); return 1;"); await c.type("ก");
  await click("[data-hist-saveclose]");
  check("บันทึกแล้วปิด หน้าต่างตัวที่สอนปิด หน้าต่างฐานยังเปิด", await waitFor("return !document.querySelector('[data-ocr-hist-dlg]') && !!document.querySelector('[data-ocr-db-dlg]');", 5000));
  check("แก้คืนเป็น ก แล้ว", (await q(`return await window.__TAURI_INTERNALS__.invoke('ocr_db_chars', { kind: 'nocr', name: ${JSON.stringify(DB)} });`)).items.some((i) => i.text === "ก"));
  await c.key("Escape");
  await waitFor("return !document.querySelector('[data-ocr-db-dlg]');", 3000);
}
// หน้าต่างตรวจบรรทัด (NOcrInspectWindow) ภาพแรกของซับไทย ฐานทดสอบที่สอน ก ไว้แล้ว
{
  await q("document.querySelector('[data-ocr-table] tbody tr')?.click(); return 1;"); await sleep(300);
  await click("[data-ocr-inspect]");
  const okI = await waitFor("return document.querySelectorAll('[data-insp-let]').length > 0;", 15000);
  await sleep(500);
  const im = await q("const d = [...document.querySelectorAll('.dlg')].pop().getBoundingClientRect(), b = document.querySelector('[data-ocr-insp-dlg]'); const ls = [...document.querySelectorAll('[data-insp-let]')]; return { w: Math.round(d.width), h: Math.round(d.height), scroll: b.scrollHeight - b.clientHeight, n: ls.length, ko: ls.findIndex((x) => x.innerText === 'ก'), miss: ls.filter((x) => x.classList.contains('miss')).length, sent: !!document.querySelector('[data-insp-sentence] img') && !!document.querySelector('.ocr-insprect') };");
  check("หน้าต่างตรวจบรรทัด ขนาดเท่าหน้าต่างอื่น ไม่เลื่อน มีปุ่มทีละตัว ภาพบรรทัดกับกรอบแดง", okI && im.w === 880 && im.scroll <= 0 && im.n > 3 && im.sent, JSON.stringify(im));
  check("ตัวที่สอน ก ไว้จับคู่ได้ ตัวที่ฐานไม่รู้จักเป็นปุ่มแดง", im.ko >= 0 && im.miss > 0, JSON.stringify(im));
  await q(`document.querySelectorAll('[data-insp-let]')[${im.ko}].click(); return 1;`); await sleep(300);
  const before = await q("return document.querySelector('[data-insp-canvas] svg').querySelectorAll('line').length;");
  await q("const n = document.querySelector('[data-insp-n]'); n.focus(); n.select(); return 1;"); await c.type("12");
  await click("[data-insp=draw]");
  await waitFor(`return document.querySelector('[data-insp-canvas] svg').querySelectorAll('line').length !== ${before};`, 5000);
  const after = await q("return document.querySelector('[data-insp-canvas] svg').querySelectorAll('line').length;");
  check("วาดใหม่ 12 เส้น (เส้นเขียวกับเส้นแดงอย่างละไม่เกิน 12 แบบ GenerateLineSegments) แล้วเส้นบนภาพเปลี่ยน ปุ่มบันทึกกดได้", after > 0 && after <= 24 && after !== before && await q("return document.querySelector('[data-insp=save]').getAttribute('aria-disabled') !== 'true';"), `${before} → ${after}`);
  await click("[data-insp=undo]");
  check("ย้อนแล้วกลับเป็นเส้นเดิม", await waitFor(`return document.querySelector('[data-insp-canvas] svg').querySelectorAll('line').length === ${before};`, 3000));
  await click("[data-insp=redo]");
  await waitFor(`return document.querySelector('[data-insp-canvas] svg').querySelectorAll('line').length === ${after};`, 3000);
  await click("[data-insp=save]");
  check("บันทึกเส้นที่วาดลงฐาน", await waitFor("return /บันทึกตัว\\s*ก/.test(document.querySelector('[data-insp-msg]')?.innerText ?? '');", 5000));
  const dbI = await q(`return await window.__TAURI_INTERNALS__.invoke('ocr_db_chars', { kind: 'nocr', name: ${JSON.stringify(DB)} });`);
  check("ตัว ก ในฐานมีเส้นตามที่วาด", dbI.items.some((i) => i.text === "ก" && i.fg.length + i.bg.length === after), JSON.stringify(dbI.items.map((i) => [i.text, i.fg.length + i.bg.length])));
  await c.shot(`${SHOT}/10-ตรวจบรรทัด.png`);
  // เพิ่มคู่ที่ดีกว่าให้ตัวที่ไม่รู้จัก ขึ้นหน้าต่างสอนตัวอักษรตัวเดิม กดหยุดแล้วกลับมาที่หน้าต่างตรวจบรรทัด
  await q("document.querySelector('[data-insp-let].miss').click(); return 1;"); await sleep(300);
  check("ตัวที่ไม่รู้จัก ปุ่มบันทึกกับลบกดไม่ได้พร้อมเหตุผล", await q("return ['save','del'].every((k) => { const b = document.querySelector(`[data-insp=${k}]`); return b.getAttribute('aria-disabled') === 'true' && b.title.includes('ยังไม่มีในฐาน'); });"));
  await click("[data-insp=better]");
  check("เพิ่มคู่ที่ดีกว่าเปิดหน้าต่างสอนตัวอักษร", await waitFor("return !!document.querySelector('[data-ocr-teach-dlg]');", 8000));
  await click("[data-teach-stop]");
  check("หยุดสอนแล้วกลับมาที่หน้าต่างตรวจบรรทัด", await waitFor("return !document.querySelector('[data-ocr-teach-dlg]') && !!document.querySelector('[data-ocr-insp-dlg]');", 5000));
  await c.key("Escape");
  check("หน้าต่างตรวจบรรทัดกด Esc ปิด", await waitFor("return !document.querySelector('[data-ocr-insp-dlg]');", 3000));
  await job("j.setCfg({ engine: 'paddle' }); return 1;"); await sleep(300);
  check("ตัวอ่าน PaddleOCR ปุ่มตรวจบรรทัดกดไม่ได้พร้อมเหตุผล", await q("const b = document.querySelector('[data-ocr-inspect]'); return b.getAttribute('aria-disabled') === 'true' && b.title.includes('nOCR');"));
  await job(`j.setCfg({ engine: 'nocr', nocrDb: ${JSON.stringify(DB)} }); return 1;`); await sleep(300);
}

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
  if (name.includes("ชุดภาษา")) { await tipCheck("[data-ocr-models-dlg]", "PaddleOCR"); await tipCheck("[data-ocr-models-dlg]", "ชุดภาษาของ Tesseract"); }
  if (name.includes("ตัวเลือก")) { await tipCheck("[data-ocr-options-dlg]", "ตัวเลือกการอ่าน"); await tipCheck("[data-ocr-options-dlg]", "วิธีวาดเส้น"); }
  check(`${name.slice(3)} กด Esc ปิดกล่อง ⓘ แล้วหน้าต่างยังอยู่`, await q(`return !!document.querySelector('${sel}');`));
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
// ---------- ป้ายผิดได้ของ Binary OCR มีปุ่ม ⓘ (ผู้ช่วยตรวจทาน U16) ----------
{
  const eng0 = await job("return j.get().cfg.engine;");
  await job("j.setCfg({ engine: 'binary' }); return 1;");
  await sleep(300);
  await tipCheck("[data-ocr-engine]", "เปอร์เซ็นต์ผิดสูงสุด");
  await job(`j.setCfg({ engine: ${JSON.stringify(eng0)} }); return 1;`);
}
// ---------- โมเดลภาษาของ PaddleOCR ที่โหลดเพิ่ม (BUGS ข้อ 152) แนบแค่อังกฤษ ไทย ญี่ปุ่น ----------
{
  const inv = (cmd, a = {}) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(a)});`);
  const ELDIR = join(process.env.LOCALAPPDATA, "com.pkh.movieshelf", "ocr", "paddle", "el_PP-OCRv5_mobile_rec");
  rmSync(ELDIR, { recursive: true, force: true });
  const langs = await inv("ocr_paddle_langs");
  const bundled = await inv("ocr_paddle_models");
  check("ข้อ 152 โหลดเพิ่มได้เก้าภาษา ภาษาที่แนบมาเหลือ PP-OCRv5 ไทยกับอังกฤษ", langs.length === 9 && !langs.some((l) => ["th", "en"].includes(l.code))
    && bundled.filter((m) => m.endsWith("_PP-OCRv5_mobile_rec")).sort().join(",") === "en_PP-OCRv5_mobile_rec,th_PP-OCRv5_mobile_rec", JSON.stringify({ langs: langs.map((l) => l.code + (l.have ? "+" : "")), bundled }));
  const lang0 = await job("return j.get().cfg.paddle.lang;");
  await job("j.setCfg({ engine: 'paddle', paddle: { ...j.get().cfg.paddle, lang: 'el' } }); return 1;");
  const card = await waitFor("return !!document.querySelector('[data-ocr-need-lang]');", 5000);
  const st = await q("const b = document.querySelector('[data-ocr-start]'); return { dis: b?.getAttribute('aria-disabled'), why: b?.title ?? '', text: document.querySelector('[data-ocr-need-lang]')?.innerText ?? '' };");
  check("ข้อ 152 เลือกภาษาที่ยังไม่ได้โหลด ขึ้นการ์ดบอกขนาด ปุ่มเริ่มอ่านกดไม่ได้พร้อมเหตุผล", card && st.dis === "true" && st.why.includes("โหลดโมเดลภาษากรีก") && st.text.includes("MB"), JSON.stringify(st));
  // กรีก 7.5 MB เล็กที่สุดชุดหนึ่ง โหลดจริงจาก Hugging Face ตรวจค่า SHA-256 ในโปรแกรม แล้วลบทิ้งตอนจบ
  await click("[data-ocr-need-get]");
  const got = await waitFor("return !document.querySelector('[data-ocr-need-lang]');", 180000);
  const after = await inv("ocr_paddle_langs");
  check("ข้อ 152 กดโหลดในการ์ด โหลดจริงสำเร็จ การ์ดหาย ภาษากรีกนับว่ามีแล้ว ปุ่มเริ่มอ่านกดได้", got && after.find((l) => l.code === "el")?.have === true
    && existsSync(join(ELDIR, "inference.onnx")) && (await q("return document.querySelector('[data-ocr-start]')?.getAttribute('aria-disabled');")) == null,
    (await q("return document.querySelector('[data-ocr-lang-err]')?.innerText ?? '';")) || "");
  await click("[data-ocr-models-open]");
  await waitFor("return !!document.querySelector('[data-paddle-dl]');", 5000);
  // รอรายชื่อโมเดลโหลดเสร็จก่อนอ่าน (รอบแรกอ่านเร็วไปแล้วตก ทั้งที่ภาพมีกรีกอยู่)
  await waitFor("return (document.querySelector('[data-paddle-v5]')?.dataset.paddleV5 ?? '').includes('กรีก');", 8000);
  await sleep(500);
  const dl = await q("const b = document.querySelector('[data-ocr-models-dlg]'); return { list: (document.querySelector('[data-paddle-v5]')?.dataset.paddleV5 ?? '').includes('กรีก'), get: document.querySelector('[data-paddle-get]')?.getAttribute('aria-disabled'), scroll: b.scrollHeight - b.clientHeight };");
  check("ข้อ 152 หน้าต่างตัวอ่านมีแถวโหลดโมเดลภาษา ภาษาที่โหลดแล้วขึ้นในแถว PP-OCRv5 ปุ่มโหลดกดไม่ได้จนกว่าจะเลือกภาษา หน้าต่างไม่ต้องเลื่อน", dl.list && dl.get === "true" && dl.scroll <= 0, JSON.stringify(dl));
  await c.shot(`docs/report-2026-11-17/OCR-ขั้น14/7-โหลดโมเดลภาษา.png`, ".dlg").catch(() => {});
  await c.key("Escape"); await sleep(300);
  await job(`j.setCfg({ paddle: { ...j.get().cfg.paddle, lang: ${JSON.stringify(lang0)} } }); return 1;`);
  rmSync(ELDIR, { recursive: true, force: true });
}
// ---------- หน้าต่างฐานตัวอักษร (ระบบแมนนวล ocrmanual.rs · NOcrSettingsWindow NOcrDbEditWindow ของ Subtitle Edit) ----------
{
  const inv = (cmd, a) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(a)});`);
  const before = await job("return { engine: j.get().cfg.engine, nocrDb: j.get().cfg.nocrDb, binDb: j.get().cfg.binDb };");
  const latin0 = await inv("ocr_db_chars", { kind: "nocr", name: "Latin" });
  await job("j.setCfg({ engine: 'nocr', nocrDb: 'Latin' }); return 1;");
  await sleep(300);
  await click("[data-ocr-db-open]");
  const okDb = await waitFor("return document.querySelectorAll('[data-ocr-db-dlg] [data-db-var]').length > 0;", 15000);
  await sleep(500);
  const m = await q("const d = document.querySelector('.dlg').getBoundingClientRect(), b = document.querySelector('[data-ocr-db-dlg]'); return { w: Math.round(d.width), h: Math.round(d.height), scroll: b.scrollHeight - b.clientHeight, title: document.querySelector('.dlg').innerText.split('\\n')[0] };");
  sizes.push(m);
  check("หน้าต่างฐานตัวอักษรเปิดได้ ไม่ต้องเลื่อน หัวบอกชนิดกับชื่อฐาน", okDb && m.scroll <= 0 && m.title.includes("nOCR Latin.nocr"), JSON.stringify(m));
  const z = await q("const s = document.querySelector('[data-db-canvas] svg').getBoundingClientRect(), b = document.querySelector('[data-db-canvas]').getBoundingClientRect(); return { sw: s.width, sh: s.height, bw: b.width, bh: b.height, z: document.querySelector('[data-db-zoom]').innerText };");
  check("รูปแบบที่เลือกขยายพอดีกรอบ ไม่ล้นกรอบ", z.sh > z.bh * 0.5 && z.sw <= z.bw && z.sh <= z.bh, JSON.stringify(z));
  await c.shot(`${SHOT}/08-ฐานตัวอักษร.png`);
  if (!latin0.saved) {
    check("ฐานที่แนบมา ปุ่มเปลี่ยนชื่อกับลบฐานกดไม่ได้พร้อมเหตุผล", await q("return ['rename','delete'].every((k) => { const b = document.querySelector(`[data-db=${k}]`); return b.getAttribute('aria-disabled') === 'true' && b.title.includes('แนบมา'); });"));
    // แก้รูปแบบที่สองของตัวแรก แล้วได้สำเนาในโฟลเดอร์ของผู้ใช้ ฐานที่แนบมาไม่ถูกแตะ
    await q("document.querySelectorAll('[data-db-var]')[1].click(); return 1;"); await sleep(300);
    const key = Number(await q("return document.querySelector('[data-db-var].on').dataset.dbVar;"));
    await q("const t = document.querySelector('[data-db-text]'); t.focus(); t.select(); return 1;"); await c.type("Q");
    await click("[data-db-save]");
    check("บันทึกตัวอักษรแล้วขึ้นผลสำเร็จ", await waitFor("return !!document.querySelector('[data-db-msg]') && /บันทึกตัว\\s*Q/.test(document.querySelector('[data-db-msg]').innerText);", 5000));
    const after = await inv("ocr_db_chars", { kind: "nocr", name: "Latin" });
    check("แก้แล้วได้สำเนาของผู้ใช้ ตัวนั้นเป็น Q จำนวนเท่าเดิม", after.saved && after.items.find((i) => i.key === key)?.text === "Q" && after.total === latin0.total, `${after.saved} ${after.total}/${latin0.total}`);
    check("ผลสำเร็จหายเองใน 3 วินาที", await waitFor("return !document.querySelector('[data-db-msg]');", 5000));
    // ลบรูปแบบ ถามก่อนแล้วจำนวนลดหนึ่ง
    await click("[data-db-delitem]");
    check("ลบรูปแบบถามยืนยันก่อน", await waitFor("return !!document.querySelector('[data-db-delitem-ok]');", 3000));
    await click("[data-db-delitem-ok]");
    await waitFor("return !!document.querySelector('[data-db-msg]');", 5000);
    check("ลบรูปแบบแล้วจำนวนลดหนึ่ง", (await inv("ocr_db_chars", { kind: "nocr", name: "Latin" })).total === latin0.total - 1);
    check("ฐานที่มีสำเนาแล้ว ปุ่มเปลี่ยนชื่อกับลบฐานกดได้", await q("return ['rename','delete'].every((k) => document.querySelector(`[data-db=${k}]`).getAttribute('aria-disabled') !== 'true');"));
    await inv("ocr_db_delete", { kind: "nocr", name: "Latin" });
    check("ลบสำเนาของผู้ใช้แล้วกลับเป็นฐานที่แนบมา", (await inv("ocr_db_chars", { kind: "nocr", name: "Latin" })).bundled);
  } else console.log("ข้าม แก้ฐาน Latin เพราะโปรแกรมทดสอบมีสำเนาของผู้ใช้อยู่แล้ว ไม่ทับของเดิม");
  // ฐานใหม่ เปลี่ยนชื่อ ลบฐาน ผ่านหน้าต่าง
  const N1 = "ตรวจฐานOCR", N2 = "ตรวจฐานOCR2";
  for (const n of [N1, N2]) { try { await inv("ocr_db_delete", { kind: "nocr", name: n }); } catch { /* ไม่มีก็ดีแล้ว */ } }
  await click("[data-db=new]");
  await waitFor("return !!document.querySelector('[data-db-name]');", 3000);
  check("ปุ่มตกลงของชื่อฐานว่างกดไม่ได้พร้อมเหตุผล", await q("const b = document.querySelector('[data-db-ok]'); return b.getAttribute('aria-disabled') === 'true' && b.title.includes('ชื่อ');"));
  await sleep(200); await c.type(N1); await c.key("Enter");
  check("ฐานใหม่สร้างแล้ว ตัวอ่านเปลี่ยนไปใช้ฐานนั้น หน้าต่างบอกฐานว่าง", await waitFor(`return window.__ocrJob.get().cfg.nocrDb === ${JSON.stringify(N1)} && !!document.querySelector('.ocr-dbempty');`, 5000));
  await click("[data-db=new]"); await waitFor("return !!document.querySelector('[data-db-name]');", 3000);
  await sleep(200); await c.type(N1); await c.key("Enter");
  check("ชื่อฐานซ้ำขึ้นการ์ดแดงบอกเหตุ", await waitFor("return (document.querySelector('[data-db-err]')?.innerText ?? '').includes('อยู่แล้ว');", 5000));
  await q("[...document.querySelectorAll('[data-db-ask] button')].find((b) => b.innerText === 'ยกเลิก')?.click(); return 1;");
  await sleep(200);
  check("ฐานที่ยังไม่มีตัว ปุ่มเปลี่ยนชื่อกดได้ (มีไฟล์แล้ว)", await q("return document.querySelector('[data-db=rename]').getAttribute('aria-disabled') !== 'true';"));
  await click("[data-db=rename]"); await waitFor("return !!document.querySelector('[data-db-name]');", 3000);
  await sleep(100); await q("document.querySelector('[data-db-name]').select(); return 1;"); await c.type(N2); await c.key("Enter");
  const dl = await waitFor(`return window.__ocrJob.get().cfg.nocrDb === ${JSON.stringify(N2)};`, 5000) && await inv("ocr_dbs", {});
  check("เปลี่ยนชื่อแล้วรายการฐานมีชื่อใหม่ ไม่มีชื่อเก่า", dl && dl.nocr.includes(N2) && !dl.nocr.includes(N1), JSON.stringify(dl?.nocr));
  await click("[data-db=delete]");
  check("ลบฐานถามยืนยันพร้อมชื่อฐาน", await waitFor(`return (document.querySelector('[data-db-ask]')?.innerText ?? '').includes(${JSON.stringify(N2 + ".nocr")});`, 3000));
  await click("[data-db-del-ok]");
  check("ลบฐานแล้วหน้าต่างปิด รายการไม่มีฐานนั้น", await waitFor("return !document.querySelector('[data-ocr-db-dlg]');", 5000) && !(await inv("ocr_dbs", {})).nocr.includes(N2));
  // ฐาน Binary OCR แสดงเป็นภาพ
  await job("j.setCfg({ engine: 'binary', binDb: 'Latin' }); return 1;"); await sleep(300);
  await click("[data-ocr-db-open]");
  check("ฐาน Binary OCR แสดงรูปแบบเป็นภาพ", await waitFor("return !!document.querySelector('[data-db-canvas] img') && document.querySelectorAll('[data-db-var] img').length > 0;", 15000));
  check("ฐาน Binary OCR ปุ่มฝึกจากฟอนต์กดไม่ได้พร้อมเหตุผล ไม่มีปุ่มย่อฐาน", await q("const b = document.querySelector('[data-db=train]'); return b.getAttribute('aria-disabled') === 'true' && b.title.includes('Binary') && !document.querySelector('[data-db=optimize]');"));
  await c.key("Escape");
  check("หน้าต่างฐานกด Esc ปิด", await waitFor("return !document.querySelector('[data-ocr-db-dlg]');", 3000));
  // ฝึกจากฟอนต์ (NOcrTrainWindow) ชุดเล็ก Arial ขนาดเดียวสามตัว แล้วย่อฐานนั้น (OptimizeNOcrDb) · ลบฐานทดสอบตอนจบ
  const NT = "ตรวจฝึกOCR";
  // ค่าที่หน้าต่างฝึกจำไว้ในเครื่อง ตัวตรวจเปลี่ยนแล้วคืนตอนจบ (รอบก่อนไม่คืน ภาพรอบถัดไปเห็นค่าของตัวตรวจ)
  const train0 = await q("return localStorage.getItem('ms.ocrTrain');");
  await q("localStorage.removeItem('ms.ocrTrain'); return 1;");
  for (const n of [NT]) { try { await inv("ocr_db_delete", { kind: "nocr", name: n }); } catch { /* ไม่มีก็ดีแล้ว */ } }
  await job("j.setCfg({ engine: 'nocr', nocrDb: 'Latin' }); return 1;"); await sleep(300);
  await click("[data-ocr-db-open]");
  await waitFor("return !!document.querySelector('[data-db=train]');", 8000);
  await click("[data-db=train]");
  const okT = await waitFor("return document.querySelectorAll('[data-ocr-train-dlg] .ocr-trfont').length > 0;", 15000);
  await waitFor("return !!document.querySelector('[data-train-prev] img');", 20000);
  const tm = await q("const d = [...document.querySelectorAll('.dlg')].pop().getBoundingClientRect(), b = document.querySelector('[data-ocr-train-dlg]'); return { w: Math.round(d.width), h: Math.round(d.height), scroll: b.scrollHeight - b.clientHeight, prev: !!document.querySelector('[data-train-prev] img'), start: document.querySelector('[data-train-start]').getAttribute('aria-disabled'), why: document.querySelector('[data-train-start]').title };");
  check("หน้าต่างฝึกจากฟอนต์ ขนาดเท่าหน้าต่างอื่น ไม่เลื่อน มีตัวอย่างฟอนต์ เริ่มฝึกกดไม่ได้จนตั้งชื่อ", okT && tm.w === 880 && tm.scroll <= 0 && tm.prev && tm.start === "true" && tm.why.includes("ชื่อ"), JSON.stringify(tm));
  await c.shot(`${SHOT}/11-ฝึกจากฟอนต์.png`);
  await q(`const set = (sel, v) => { const e = document.querySelector(sel); const p = Object.getPrototypeOf(e); Object.getOwnPropertyDescriptor(p, 'value').set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('[data-train-name]', ${JSON.stringify(NT)}); set('[data-train-sizes]', '30'); set('[data-train-chars]', 'abc'); return 1;`);
  await q("const s = [...document.querySelectorAll('[data-ocr-train-dlg] [role=switch]')].find((x) => x.getAttribute('aria-label') === 'ฝึกตัวเอียงด้วย'); if (s.getAttribute('aria-checked') === 'true') s.click(); return 1;");
  await sleep(300);
  await click("[data-train-start]");
  check("ฝึกเสร็จขึ้นผลจำนวนตัว ตัวอ่านเปลี่ยนไปใช้ฐานที่ฝึก", await waitFor(`return !!document.querySelector('[data-train-done]') && window.__ocrJob.get().cfg.nocrDb === ${JSON.stringify(NT)};`, 120000), await q("return document.querySelector('[data-train-done]')?.innerText ?? document.querySelector('[data-train-err]')?.innerText ?? '';"));
  const dT = await inv("ocr_db_chars", { kind: "nocr", name: NT });
  check("ฐานที่ฝึกมีตัว a b c", ["a", "b", "c"].every((t) => dT.items.some((i) => i.text === t)), JSON.stringify(dT.items.map((i) => i.text)));
  await c.key("Escape");
  await waitFor("return !document.querySelector('[data-ocr-train-dlg]') && !!document.querySelector('[data-ocr-db-dlg]');", 5000);
  check("หน้าต่างฐานเปิดฐานที่ฝึกแล้ว", await waitFor(`return (document.querySelector('.dlg')?.innerText ?? '').includes(${JSON.stringify(NT + ".nocr")});`, 5000));
  await click("[data-db=optimize]");
  check("ย่อฐานถามยืนยันพร้อมบอกว่าสำรองไฟล์เดิม", await waitFor("return (document.querySelector('[data-db-ask]')?.innerText ?? '').includes('.bak');", 3000));
  await click("[data-db-opt-ok]");
  check("ย่อฐานเสร็จบอกจำนวนเส้นก่อนหลังกับไฟล์สำรอง", await waitFor("return /เส้นเทียบจาก[\\s\\S]*\\.bak/.test(document.querySelector('[data-db-msg]')?.innerText ?? '');", 180000), await q("return document.querySelector('[data-db-msg]')?.innerText ?? document.querySelector('[data-db-err]')?.innerText ?? '';"));
  await c.key("Escape");
  await waitFor("return !document.querySelector('[data-ocr-db-dlg]');", 3000);
  try { await inv("ocr_db_delete", { kind: "nocr", name: NT }); } catch { /* ลบไม่ได้ไม่เป็นไร */ }
  await q(train0 == null ? "localStorage.removeItem('ms.ocrTrain'); return 1;" : `localStorage.setItem('ms.ocrTrain', ${JSON.stringify(train0)}); return 1;`);
  await job(`j.setCfg(${JSON.stringify(before)}); return 1;`);
}
check("หน้าต่างซ้อนทุกหน้าต่างขนาดเท่ากัน", sizes.every((s) => s.w === sizes[0].w && s.h === sizes[0].h), JSON.stringify(sizes.map((s) => `${s.w}×${s.h}`)));

// ---------- เลือกหลายบรรทัด เติมจากคลิปบอร์ด ลบบรรทัด (FillSelectedLinesWithClipboard DeleteSelectedLines) ----------
{
  const rowsN = () => q("return document.querySelectorAll('[data-ocr-table] tbody tr').length;");
  const n0 = await rowsN();
  const clickRow = (k, mod) => q(`const r = document.querySelectorAll('[data-ocr-table] tbody tr')[${k}]; r.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: ${mod === "ctrl"}, shiftKey: ${mod === "shift"} })); return 1;`);
  await clickRow(1); await sleep(150);
  check("เลือกบรรทัดเดียว ปุ่มเติมจากคลิปบอร์ดกดไม่ได้พร้อมเหตุผล", await q("const b = document.querySelector('[data-ocr-fill]'); return b.getAttribute('aria-disabled') === 'true' && b.title.includes('สองบรรทัด');"));
  await clickRow(3, "shift"); await sleep(150);
  check("Shift เลือกช่วงได้สามบรรทัด", (await q("return document.querySelectorAll('[data-ocr-table] tbody tr.on').length;")) === 3);
  await clickRow(5, "ctrl"); await sleep(150);
  check("Ctrl เลือกเพิ่มเป็นสี่บรรทัด", (await q("return document.querySelectorAll('[data-ocr-table] tbody tr.on').length;")) === 4);
  const keep = await job("return [1,2,3,5].map((k) => j.get().rows[k].text);");
  await q("window.__ocrClip = 'ข้อความจากคลิปบอร์ด'; return 1;");
  await click("[data-ocr-fill]");
  check("เติมจากคลิปบอร์ดใส่ข้อความเดียวกันทุกบรรทัดที่เลือก บอกจำนวน", await waitFor("const r = window.__ocrJob.get().rows; return [1,2,3,5].every((k) => r[k].text === 'ข้อความจากคลิปบอร์ด') && r[4].text !== 'ข้อความจากคลิปบอร์ด' && (document.querySelector('[data-ocr-clipmsg]')?.innerText ?? '').includes('4 บรรทัด');", 3000));
  await job(`[1,2,3,5].forEach((k, x) => j.setText(k, ${JSON.stringify(keep)}[x])); return 1;`);
  await q("delete window.__ocrClip; return 1;");
  // ลบสองบรรทัดที่เลือก ถามก่อน แล้วตารางเหลือน้อยลงสอง
  await clickRow(2); await sleep(100); await clickRow(4, "ctrl"); await sleep(150);
  const nums = await q("return [...document.querySelectorAll('[data-ocr-table] tbody tr.on')].map((r) => r.dataset.n);");
  await click("[data-ocr-del]");
  check("ลบบรรทัดถามยืนยันก่อน บอกจำนวน", await waitFor("return (document.querySelector('[data-ocr-del-ask]')?.innerText ?? '').includes('2 บรรทัด');", 3000));
  await click("[data-ocr-del-ok]");
  await waitFor(`return document.querySelectorAll('[data-ocr-table] tbody tr').length === ${n0 - 2};`, 5000);
  const left = await q("return [...document.querySelectorAll('[data-ocr-table] tbody tr')].map((r) => r.dataset.n);");
  check("ลบแล้วตารางเหลือน้อยลงสองบรรทัด ภาพที่ลบไม่อยู่", left.length === n0 - 2 && nums.every((x) => !left.includes(x)), `${n0} → ${left.length} ลบ ${nums}`);
  // U18 ลูกศรขึ้นลงเลือกบรรทัดในตาราง · U6 คีย์ลัดผ่าน useHotkeys กด Delete แล้วถามยืนยัน มีหน้าต่างซ้อนเปิดอยู่ไม่ทำงาน
  await clickRow(0); await sleep(150);
  await q("document.activeElement?.blur(); return 1;");
  await c.key("ArrowDown"); await c.key("ArrowDown"); await sleep(200);
  check("ผู้ช่วยตรวจทาน U18 ลูกศรลงสองครั้งเลือกบรรทัดที่สาม", (await q("return [...document.querySelectorAll('[data-ocr-table] tbody tr')].findIndex((r) => r.classList.contains('on'));")) === 2);
  await c.key("ArrowUp"); await sleep(200);
  check("ผู้ช่วยตรวจทาน U18 ลูกศรขึ้นกลับบรรทัดที่สอง", (await q("return [...document.querySelectorAll('[data-ocr-table] tbody tr')].findIndex((r) => r.classList.contains('on'));")) === 1);
  await c.key("Delete");
  check("ผู้ช่วยตรวจทาน U6 กด Delete ถามยืนยันลบ", await waitFor("return !!document.querySelector('[data-ocr-del-ask]');", 3000));
  await q("[...document.querySelectorAll('[data-ocr-del-ask] button')].find((b) => b.innerText.trim() === 'ยกเลิก').click(); return 1;"); await sleep(200);
  await click("[data-ocr-export]"); await waitFor("return !!document.querySelector('[data-ocr-exp]');", 5000);
  await q("document.activeElement?.blur(); return 1;");
  await c.key("Delete"); await sleep(300);
  check("ผู้ช่วยตรวจทาน U6 มีหน้าต่างซ้อนเปิดอยู่ กด Delete ไม่ถามลบบรรทัดข้างหลัง", !(await q("return !!document.querySelector('[data-ocr-del-ask]');")));
  await c.key("Escape"); await sleep(300);
  // U2 เปิดเฉพาะจุดที่ต้องตรวจ แล้ว Shift เลือกช่วง ได้เฉพาะแถวที่เห็น
  const flagged = await q("return document.querySelectorAll('[data-ocr-table] tbody tr.flag').length;");
  if (flagged >= 2) {
    await click("[data-ocr-only] [role=switch], [data-ocr-onlyflag] [role=switch]").catch(() => {});
    await q("const s = [...document.querySelectorAll('[role=switch]')].find((x) => (x.getAttribute('aria-label') ?? '').includes('เฉพาะจุดที่ต้องตรวจ')); if (s && s.getAttribute('aria-checked') !== 'true') s.click(); return 1;"); await sleep(300);
    const vis = await rowsN();
    await clickRow(0); await sleep(100); await clickRow(vis - 1, "shift"); await sleep(150);
    const picked = await q("return document.querySelectorAll('[data-ocr-table] tbody tr.on').length;");
    const all = await job("return j.get().rows.length;");
    check("ผู้ช่วยตรวจทาน U2 เปิดเฉพาะจุดที่ต้องตรวจแล้ว Shift เลือกช่วง ได้เฉพาะแถวที่เห็น", vis < all && picked === vis, `เห็น ${vis} เลือก ${picked} ทั้งหมด ${all}`);
    await click("[data-ocr-del]");
    check("ผู้ช่วยตรวจทาน U2 แถบยืนยันลบนับเฉพาะแถวที่เห็น", await waitFor(`return (document.querySelector('[data-ocr-del-ask]')?.innerText ?? '').includes('${vis} บรรทัด');`, 3000));
    await q("[...document.querySelectorAll('[data-ocr-del-ask] button')].find((b) => b.innerText.trim() === 'ยกเลิก').click(); const s = [...document.querySelectorAll('[role=switch]')].find((x) => (x.getAttribute('aria-label') ?? '').includes('เฉพาะจุดที่ต้องตรวจ')); if (s && s.getAttribute('aria-checked') === 'true') s.click(); return 1;"); await sleep(300);
  } else check("ผู้ช่วยตรวจทาน U2 ต้องมีจุดที่ต้องตรวจอย่างน้อยสองบรรทัด", false, String(flagged));
}

// ---------- สีของ VobSub (VobSubColorChooserWindow) ซับไทย 480p ----------
{
  const VOB = "D:/movie-shelf/test-media/สร้าง/ocr/th-480.idx";
  const vob0 = await q("return localStorage.getItem('ms.ocrVobColors');");
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(VOB)}); return 1;`);
  await waitFor("return !!document.querySelector('[data-ocr-open]') || !!document.querySelector('[data-ocr-page]');", 60000);
  if (!(await q("return !!document.querySelector('[data-ocr-page]');"))) await click("[data-ocr-open]");
  // ผล OCR ของซับก่อนค้างอยู่ ไม่เปิดทับเงียบ ๆ ถามก่อน งานเดิมยังอยู่จนกดเปิด (ผู้ช่วยตรวจทาน U1 · เดิมผลหายทันที)
  const other = await waitFor("return !!document.querySelector('[data-ocr-other]');", 8000);
  const kept = await job("return j.get().rows.filter((r) => r.state === 'done').length;");
  check("ผู้ช่วยตรวจทาน U1 เปิดซับอื่นตอนผล OCR เดิมค้าง ขึ้นการ์ดถามก่อน ผลเดิมยังอยู่", other && kept > 0 && (await q("return document.querySelector('[data-ocr-other]').innerText;")).includes("th.sup"), String(kept));
  await click("[data-ocr-other-open]");
  await waitFor("return document.querySelectorAll('[data-ocr-table] tbody tr').length > 0 && window.__ocrJob.get().kind === 'vobsub';", 60000);
  check("ซับ VobSub มีปุ่มสีของ VobSub ในแถบล่าง", await waitFor("return !!document.querySelector('[data-ocr-vob-open]');", 5000));
  await click("[data-ocr-vob-open]");
  const okV = await waitFor("return !!document.querySelector('[data-vob-prev] img');", 15000);
  const vm = await q("const d = [...document.querySelectorAll('.dlg')].pop().getBoundingClientRect(), b = document.querySelector('[data-ocr-vob-dlg]'); return { w: Math.round(d.width), h: Math.round(d.height), scroll: b.scrollHeight - b.clientHeight, rows: document.querySelectorAll('[data-vob-row]').length, reset: document.querySelector('[data-vob-reset]').getAttribute('aria-disabled') };");
  check("หน้าต่างสีของ VobSub ขนาดเท่าหน้าต่างอื่น สี่สี ตัวอย่างภาพ คืนค่าตั้งต้นกดไม่ได้ตอนเป็นค่าตั้งต้น", okV && vm.w === 880 && vm.scroll <= 0 && vm.rows === 4 && vm.reset === "true", JSON.stringify(vm));
  // Pattern กับ Emphasis เป็นแดง แล้วใช้สีนี้ ภาพในตารางเป็นสีแดง
  await q(`const set = (sel, v) => { const e = document.querySelector(sel); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(e, v); e.dispatchEvent(new Event('input', { bubbles: true })); };
    set('[data-vob-color="1"]', '#ff0000'); set('[data-vob-color="2"]', '#ff0000'); set('[data-vob-color="3"]', '#ff0000'); return 1;`);
  await sleep(600);
  await c.shot(`${SHOT}/12-สีของVobSub.png`);
  await click("[data-vob-apply]");
  // ระหว่างวาดใหม่ ปุ่มที่กดไม่ได้บอกเหตุผลติดปุ่ม ไม่ใช้ disabled เปล่า (ผู้ช่วยตรวจทาน U15) · วาดเสร็จก่อนอ่านได้ บอกในหมายเหตุ
  const busyV = await q("const d = document.querySelector('[data-ocr-vob-dlg]'); if (!d) return { gone: true }; const dlg = d.closest('.dlg') ?? document; const sw = dlg.querySelector('[data-vob-swap]'); return { gone: false, swap: sw?.getAttribute('aria-disabled'), why: sw?.title ?? '', bare: dlg.querySelectorAll('button[disabled]').length };");
  check("ผู้ช่วยตรวจทาน U15 ระหว่างวาดใหม่ ปุ่มที่กดไม่ได้บอกเหตุผล ไม่มีปุ่ม disabled เปล่า", busyV.gone || (busyV.swap === "true" && busyV.why.includes("กำลังวาด") && busyV.bare === 0), JSON.stringify(busyV));
  await waitFor("return !document.querySelector('[data-ocr-vob-dlg]');", 30000);
  await sleep(1500);
  const red = await q(`const img = document.querySelector('[data-ocr-table] tbody tr .ocr-line img'); if (!img) return null; await img.decode().catch(() => {});
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data; let ink = 0, r = 0; for (let k = 0; k < d.length; k += 4) if (d[k + 3] > 0) { ink++; if (d[k] > 200 && d[k + 1] < 40 && d[k + 2] < 40) r++; } return { ink, r };`);
  check("ใช้สีแดงแล้วภาพในตารางวาดใหม่เป็นสีแดง", red && red.ink > 0 && red.r / red.ink > 0.95, JSON.stringify(red));
  check("สีที่ตั้งจำไว้ในเครื่อง", (await q("return localStorage.getItem('ms.ocrVobColors') ?? '';")).includes("255,0,0"));
  // คืนค่าตั้งต้น กลับไปใช้จานสีของไฟล์
  await click("[data-ocr-vob-open]");
  await waitFor("return !!document.querySelector('[data-vob-reset]');", 5000);
  await click("[data-vob-reset]");
  await click("[data-vob-apply]");
  await waitFor("return !document.querySelector('[data-ocr-vob-dlg]');", 30000);
  await sleep(1500);
  const back = await q(`const img = document.querySelector('[data-ocr-table] tbody tr .ocr-line img'); await img.decode().catch(() => {});
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, cv.width, cv.height).data; let r = 0; for (let k = 0; k < d.length; k += 4) if (d[k + 3] > 0 && d[k] > 200 && d[k + 1] < 40 && d[k + 2] < 40) r++; return r;`);
  check("คืนค่าตั้งต้นแล้วภาพกลับไปใช้จานสีของไฟล์ ไม่มีสีแดง", back === 0, String(back));
  await q(vob0 == null ? "localStorage.removeItem('ms.ocrVobColors'); return 1;" : `localStorage.setItem('ms.ocrVobColors', ${JSON.stringify(vob0)}); return 1;`);
}

// ---------- คำที่ไม่รู้จักระหว่างอ่าน (ซับ ACCA ไม่บันทึกภาพ) ----------
if (ACCA) {
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(ACCA)}); return 1;`);
  // หน้ายังอยู่ในงาน OCR ต่อจากไฟล์ก่อน หน้า OCR ขึ้นเลย ไม่ต้องกดปุ่มเปิด
  await waitFor("return !!document.querySelector('[data-ocr-open]') || !!document.querySelector('[data-ocr-page]');", 60000);
  if (await waitFor("return !!document.querySelector('[data-ocr-other-open]');", 5000)) await click("[data-ocr-other-open]");
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
