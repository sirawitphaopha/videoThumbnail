// เทสหน้ากราฟเสียง โหมดแปลงเสียง เทียบสองไฟล์ ข้อมูลเพลง (แผนเสียงและซับ ขั้น 8) ในหน้าต่างโปรแกรมจริง ผ่านพอร์ตดีบัก
// ใช้: node scripts/check-convert.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1 แบบอยู่หลังสุด) · --built ตัวที่สร้างจริง
// ไฟล์เสียงเป็นสำเนาในโฟลเดอร์ทดสอบ D:\dev\tmp ไม่แตะ test-media · ไม่กดปุ่มเลือกโฟลเดอร์ (หน้าต่างเลือกโฟลเดอร์จะเด้งขึ้นจอ) ไม่กดปุ่มเปิดเล่น
// ผ่านเมื่อ ลากหลายไฟล์เข้าคิว · ตั้งทีเดียวทั้งคิวกับทีละไฟล์ · Monkey's Audio ใช้ได้ TAK บอกว่ายังไม่ได้ใส่ · แปลงจริงทุกไฟล์ ชนิด ความยาว ช่อง ตรง
//          ข้อมูลเพลงกับรูปปกติดไป · ชื่อชนต่อท้าย (2) ไม่เขียนทับ · ไฟล์เดิม hash เท่าเดิม · หยุดทั้งคิวไม่ค้างไฟล์ · ที่ว่างไม่พอไม่เริ่ม
//          เทียบสองไฟล์ 6 แท็บวาดจากข้อมูลจริง · ข้อมูลเพลงดูได้ ไฟล์ไม่มีข้อมูลบอกว่าไม่มี · เปลี่ยนหน้าแล้วคิวไม่หาย
import { mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const AV = join("test-media", "สร้าง", "เสียงซับ");
const FF = resolve("src-tauri", "tools", "ffmpeg.exe");
const TMP = "D:\\dev\\tmp";
for (const d of readdirSync(TMP)) if (d.startsWith("แปลงเสียง-")) rmSync(join(TMP, d), { recursive: true, force: true });
const DIR = join(TMP, `แปลงเสียง-${Date.now()}`);
const BUILT = process.argv.includes("--built");
const OUT = BUILT ? "docs/report-2026-11-07/เสียงซับ-ตัวจริง" : "docs/report-2026-11-07/เสียงซับ-ขั้น2";
mkdirSync(OUT, { recursive: true });
mkdirSync(DIR, { recursive: true });
const F = (n) => join(DIR, n);
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const ff = (args) => execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args]);

// ไฟล์ทดสอบ · FLAC MP3 มีแท็กกับปก (make-test-media) · WAV ไม่มีแท็ก · AC-3 5.1 · ไฟล์ยาว 30 นาทีไว้เทสหยุด · วิดีโอไม่มีเสียง
console.log("เตรียมไฟล์ทดสอบ");
ff(["-f", "lavfi", "-i", "anoisesrc=color=pink:sample_rate=48000:amplitude=0.2:duration=1800", "-ac", "2", "-c:a", "pcm_s16le", F("ยาว 30 นาที.wav")]);
copyFileSync(join(AV, "เพลงทดสอบ 96k.flac"), F("เพลงทดสอบ 96k.flac"));
copyFileSync(join(AV, "เพลงทดสอบ.wav"), F("เพลงทดสอบ.wav"));
copyFileSync(join(AV, "เพลงทดสอบ.mp3"), F("เพลงทดสอบ.mp3"));
copyFileSync(join(AV, "ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3"), F("พากย์ไทย 5.1.ac3"));
copyFileSync(join(AV, "เพลงทดสอบ 96k.flac"), F("เพลงทดสอบ 96k สำเนา.flac"));
copyFileSync(join(AV, "เพลงทดสอบ 96k.flac"), F("เพลงทดสอบ 96k TAK.flac"));
ff(["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25:duration=2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", F("ไม่มีเสียง.mp4")]);
// ไฟล์ชื่อชน · ไฟล์ปลายทางของ WAV มีอยู่แล้ว ต้องได้ (2) และไฟล์นี้ไม่ถูกแตะ
writeFileSync(F("เพลงทดสอบ.ape"), "ไฟล์เดิมห้ามทับ");
const ORDER = ["ยาว 30 นาที.wav", "เพลงทดสอบ 96k.flac", "เพลงทดสอบ.wav", "เพลงทดสอบ.mp3", "พากย์ไทย 5.1.ac3", "เพลงทดสอบ 96k สำเนา.flac", "เพลงทดสอบ 96k TAK.flac", "ไม่มีเสียง.mp4"];
const h0 = Object.fromEntries(ORDER.map((n) => [n, sha(F(n))]));
const hBlock = sha(F("เพลงทดสอบ.ape"));

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
/** ถ่ายภาพชิ้นที่สูงกว่าจอได้ครบ · ขยายความสูงหน้าจำลองชั่วคราวผ่าน CDP (หน้าต่างจริงไม่ขยับ ไม่ขึ้นจอ) แล้วคืนค่า
    รอบแรกถ่ายตามจอจริง ภาพคิวกับหน้าเทียบโดนตัดท้าย และแถบชื่อหน้าต่างทับหัวภาพ (เจอตอนตรวจภาพ) */
const shot = async (f, sel, pad = 6) => {
  await c.evaluate("document.querySelectorAll('.toast .x').forEach(b => b.click())");
  const m = await q(`const el = document.querySelector(${JSON.stringify(sel)}); return { w: innerWidth, h: innerHeight, need: el ? Math.ceil(el.getBoundingClientRect().height) + 160 : 0 }`);
  const tall = m.need > m.h;
  if (tall) { await c.send("Emulation.setDeviceMetricsOverride", { width: m.w, height: Math.min(2600, m.need), deviceScaleFactor: 1, mobile: false }); await sleep(500); }
  await q(`document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'start' }); return 1`);
  await c.move(5, 5); await sleep(300);
  try { return await c.shot(`${OUT}/${f}`, sel, pad); }
  finally { if (tall) { await c.send("Emulation.clearDeviceMetricsOverride"); await sleep(300); } }
};
const waitFor = async (js, ms = 30000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const clickText = (sel, t) => c.evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.innerText.includes(${JSON.stringify(t)})); if (!b) throw new Error('ไม่เจอปุ่ม ' + ${JSON.stringify(t)}); b.click(); return true; })()`);
const drop = (paths) => c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: ${JSON.stringify(paths)}, position: { x: 700, y: 400 } } })`);
const row = (n) => `document.querySelector('[data-qrow="${n}"]')`;
const rowText = (n) => q(`return ${row(n)}?.innerText.replace(/\\s+/g, ' ') ?? ''`);
const inked = (sel) => q(`const cv = document.querySelector(${JSON.stringify(sel)}); if (!cv || !cv.width) return -1;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0, m = 0;
  for (let i = 0; i < d.length; i += 4 * 7) { m++; if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 30) n++; }
  return Math.round(n / m * 1000) / 1000;`);
const leftovers = () => readdirSync(DIR).filter((n) => n.includes(".partial-"));

/* ---------- เตรียม ---------- */
await inv("dev_fake_free", { bytes: 0 });
await q("localStorage.removeItem('ms.convAll'); localStorage.removeItem('ms.codecLast'); localStorage.removeItem('graph-prefs'); return 1");
// ตัวที่สร้างจริง จดทุกอย่างที่โดนกติกาความปลอดภัย (CSP) กัน ตั้งแต่ก่อนหน้าโหลด (แบบ check-graph --built)
if (BUILT) {
  await c.send("Page.enable");
  await c.send("Page.addScriptToEvaluateOnNewDocument", { source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ dir: e.violatedDirective, uri: e.blockedURI }));" });
}
await c.evaluate("location.hash = ''; location.reload()"); await sleep(2500);
if (BUILT) {
  const origin = await q("return location.origin");
  check("ตัวโปรแกรมที่สร้างจริง หน้าโหลดจากตัวโปรแกรม ไม่ใช่ dev server", origin === "http://tauri.localhost", origin);
}
await waitFor("return !!document.querySelector('.side .nav')", 30000);
await clickText(".side .nav", "กราฟเสียง");
await waitFor("return !!document.querySelector('[data-gmode]')", 10000);
// ตัวรับไฟล์ที่ลากลงหน้าต่างลงทะเบียนหลังหน้าขึ้นราวครึ่งวินาที (เรียกฝั่ง Rust 4 รอบ) · รอบแรกลากทันทีหลังเปิดหน้า ไฟล์ไม่เข้าคิว
await sleep(1500);

/* ---------- 1 สลับโหมด · คิวว่าง ---------- */
const modes = await q("return [...document.querySelectorAll('[data-gmode]')].map(b => b.innerText.trim()).join(' · ')");
check("หน้ากราฟเสียงมีปุ่มสลับ ดูกราฟ กับ แปลงเสียง", modes === "ดูกราฟ · แปลงเสียง", modes);
await c.click('[data-gmode="convert"]');
await waitFor("return !!document.querySelector('[data-convert]')", 5000);
const empty = await q("return document.querySelector('[data-qsum]').innerText + ' · ' + document.querySelector('[data-qstart]').innerText + ' · ' + document.querySelector('[data-qstart]').getAttribute('aria-disabled')");
check("โหมดแปลงเสียง คิวว่าง บอกว่ายังไม่มีไฟล์ ปุ่มแปลงกดไม่ได้", empty.includes("ยังไม่มีไฟล์") && empty.endsWith("true"), empty);

/* ---------- 2 ลากหลายไฟล์เข้าคิว ---------- */
await drop(ORDER.map(F));
await waitFor(`return document.querySelectorAll('[data-qrow]').length === ${ORDER.length} && ![...document.querySelectorAll('[data-qrow]')].some(r => r.querySelector('[data-qwait]')?.innerText === 'กำลังอ่านไฟล์')`, 30000);
await waitFor("return !![...document.querySelectorAll('[data-qrow=\"เพลงทดสอบ 96k.flac\"] img.cqcov')].length", 15000);
const names = await q("return [...document.querySelectorAll('[data-qrow]')].map(r => r.dataset.qrow)");
check(`ลาก ${ORDER.length} ไฟล์พร้อมกัน เข้าคิวครบ เรียงตามที่ลาก`, JSON.stringify(names) === JSON.stringify(ORDER), names.join(" · "));
const flacRow = await rowText("เพลงทดสอบ 96k.flac");
check("แถว FLAC บอกชนิด ช่อง บิต อัตราสุ่ม ขนาด มีรูปปกจากไฟล์ · ปลายทางตั้งต้น FLAC Level 5", flacRow.includes("FLAC 2.0") && flacRow.includes("24 บิต 96 kHz") && /FLAC.*Level 5/.test(flacRow), flacRow.slice(0, 160));
const bad = await rowText("ไม่มีเสียง.mp4");
check("ไฟล์ที่ไม่มีแทร็กเสียง ขึ้นว่าอ่านไฟล์ไม่ได้ ไม่นับในคิว", bad.includes("อ่านไฟล์ไม่ได้") && bad.includes("ไม่มีแทร็กเสียง"), bad.slice(0, 140));
await drop([F("เพลงทดสอบ 96k.flac")]);
await sleep(600);
const dup = await q("return document.querySelectorAll('[data-qrow]').length + ' · ' + ([...document.querySelectorAll('.toast')].map(t => t.innerText).join(' ') || 'ไม่มีแจ้ง')");
check("ลากไฟล์เดิมซ้ำได้ เพิ่มอีกแถว ไม่มีข้อความข้ามไฟล์", dup.startsWith(`${ORDER.length + 1} ·`) && !dup.includes("ข้าม"), dup.slice(0, 120));
await q("[...document.querySelectorAll('[data-qrow]')].at(-1).querySelector('[data-qremove]').click();");
await sleep(200);

/* ---------- 3 ตั้งทีเดียวทั้งคิว ---------- */
await c.click("[data-qall]");
await waitFor("return !!document.querySelector('[data-codec-panel]')", 10000);
const panelHead = await q("return document.querySelector('.dlg h4').innerText");
const lossless = await q("return [...document.querySelectorAll('[data-codec-panel] .seg')][1].innerText.replace(/\\s+/g, ' ')");
check("ตั้งทีเดียวทั้งคิว เปิดแผงตั้งค่าเสียงเดียวกับหน้าเสียงและซับ · Lossless มี Monkey's Audio กับ TAK (เฉพาะหน้านี้)", panelHead.includes("ตั้งทีเดียวทั้งคิว") && lossless.includes("Monkey's Audio") && lossless.includes("TAK"), `${panelHead} · ${lossless}`);
await clickText("[data-codec-panel] .seg button", "Opus");
await sleep(300);
await c.click('[data-preset="1"]');
await sleep(300);
await c.click("[data-conv-use]");
await sleep(400);
const afterAll = await q("return [...document.querySelectorAll('[data-qrow]')].filter(r => r.dataset.qstate === 'wait').map(r => r.querySelector('.dd').innerText.trim())");
check("เลือก Opus เพลงคุณภาพดี ใช้กับทุกไฟล์ที่ยังไม่เริ่ม", afterAll.length === ORDER.length - 1 && afterAll.every((t) => /^Opus.*160 kbps/.test(t)), afterAll.join(" · "));

// เปิดแผงของแถวที่ตั้งด้วยชุดค่าแบบง่ายซ้ำ ต้องได้แท็บแบบง่ายกับชุดเดิม (เดิมเด้งไปขั้นสูง เพราะเทียบช่อง Bit depth ที่ Opus ไม่มี)
await c.click('[data-qrow="เพลงทดสอบ.mp3"] [data-qto]');
await waitFor("return !!document.querySelector('[data-codec-panel]')", 10000);
const reopen = await q("return document.querySelector('[data-codec-panel]').dataset.tab + ' · ' + document.querySelector('[data-preset=\"1\"]')?.getAttribute('aria-checked')");
check("เปิดแผงของแถวที่ตั้ง Opus เพลงคุณภาพดีไว้ซ้ำ ได้แท็บแบบง่าย ชุดเพลงคุณภาพดีถูกเลือก", reopen === "easy · true", reopen);
await clickText(".dlg .acts button", "ยกเลิก");
await sleep(300);

/* ---------- 4 ตั้งทีละไฟล์ ---------- */
const setRow = async (n, pick) => {
  await c.click(`[data-qrow="${n}"] [data-qto]`);
  await waitFor("return !!document.querySelector('[data-codec-panel]')", 10000);
  await pick();
  await sleep(300);
  await c.click("[data-conv-use]");
  await sleep(400);
  return (await rowText(n));
};
const pickCodec = async (name, preset) => {
  await clickText("[data-codec-panel] .seg button", name); await sleep(300);
  if (preset == null) return;
  // ชุดค่าอยู่แท็บแบบง่าย · แผงจำแท็บที่ใช้ครั้งล่าสุดของชนิดนั้น
  await q("if (!document.querySelector('[data-preset]')) [...document.querySelectorAll('[data-codec-panel] .seg button')].find(b => b.innerText === 'แบบง่าย')?.click(); return 1");
  await sleep(200);
  await c.click(`[data-preset="${preset}"]`); await sleep(200);
};
await setRow("ยาว 30 นาที.wav", async () => { await pickCodec("Monkey's Audio", 3); await clickText("[data-codec-panel] .seg button", "ขั้นสูง"); await sleep(300); await clickText("[data-card=level] .seg button", "Insane"); });
const wavRow = await setRow("เพลงทดสอบ.wav", () => pickCodec("Monkey's Audio", 2));
check("ตั้งไฟล์เดียว WAV เป็น Monkey's Audio High แถวอื่นไม่เปลี่ยน", /Monkey's Audio.*High/.test(wavRow) && /Opus.*160/.test(await rowText("เพลงทดสอบ.mp3")), wavRow.slice(0, 120));
// TAK แตก Takc.exe จากชุดที่แนบมาเอง (8 พ.ย. 2569 · เดิมต้องวางเอง ข้อนี้เคยเช็กว่าปุ่มกดไม่ได้)
await c.click('[data-qrow="เพลงทดสอบ.mp3"] [data-qto]');
await waitFor("return !!document.querySelector('[data-codec-panel]')", 10000);
await pickCodec("TAK");
await waitFor("return (document.querySelector('[data-cmd]')?.innerText ?? '').includes('Takc')", 5000);
const tak = await q("return !!document.querySelector('[data-native-missing]') + ' · ' + document.querySelector('[data-conv-use]').getAttribute('aria-disabled') + ' · ' + document.querySelector('[data-codec-panel]').innerText.includes('Takc 2.3.3') + ' · ' + document.querySelector('[data-cmd]').innerText.replace(/\\s+/g, ' ')");
check("เลือก TAK ใช้ได้เลย ไม่มีป้ายหาตัวแปลงไม่เจอ ปุ่มใช้ค่านี้กดได้ ตัวแปลง Takc 2.3.3 · คำสั่งที่จะรันเป็น Takc -e -p2 -ihs", tak.startsWith("false · null · true") && tak.includes("Takc -e -p2 -ihs"), tak.slice(0, 220));
await shot("22-แผงตั้งค่า-TAK.png", ".dlg", 4);
await pickCodec("Monkey's Audio", 1);
const apeCmd = await q("return document.querySelector('[data-cmd]').innerText.replace(/\\s+/g, ' ')");
check("เลือก Monkey's Audio คำสั่งบอกว่า ffmpeg ส่งเสียงให้ MACDll64 ระดับ 2000 (Normal)", apeCmd.includes("MACDll64 --level 2000"), apeCmd.slice(apeCmd.indexOf("MACDll64"), apeCmd.indexOf("MACDll64") + 40));
await clickText(".dlg .acts button", "ยกเลิก");
await sleep(300);
await setRow("เพลงทดสอบ.mp3", () => pickCodec("FLAC", 2));
await setRow("พากย์ไทย 5.1.ac3", () => pickCodec("WavPack", 1));
await setRow("เพลงทดสอบ 96k สำเนา.flac", () => pickCodec("Monkey's Audio", 1));
await setRow("เพลงทดสอบ 96k TAK.flac", () => pickCodec("TAK", 3));
const targets = await q("return Object.fromEntries([...document.querySelectorAll('[data-qrow]')].map(r => [r.dataset.qrow, r.querySelector('.dd').innerText.trim()]))");
check("ปลายทางรายแถว Monkey's Audio · Opus · Monkey's Audio · FLAC · WavPack · Monkey's Audio · TAK",/Monkey's Audio.*Insane/.test(targets["ยาว 30 นาที.wav"]) && /^Opus.*160/.test(targets["เพลงทดสอบ 96k.flac"]) && /Monkey's Audio.*High/.test(targets["เพลงทดสอบ.wav"])
  && /FLAC.*Level 8/.test(targets["เพลงทดสอบ.mp3"]) && /WavPack.*Normal/.test(targets["พากย์ไทย 5.1.ac3"]) && /Monkey's Audio.*Normal/.test(targets["เพลงทดสอบ 96k สำเนา.flac"]) && /TAK.*-p4m/.test(targets["เพลงทดสอบ 96k TAK.flac"]), JSON.stringify(targets));
await shot("23-คิวแปลงก่อนเริ่ม.png", "[data-convert]", 4);

/* ---------- 5 ที่ว่างไม่พอ ไม่เริ่ม ---------- */
await inv("dev_fake_free", { bytes: 1000000 });
await c.click("[data-qstart]");
await waitFor(`return ${row("ยาว 30 นาที.wav")}?.dataset.qstate === 'fail'`, 20000);
const space = await rowText("ยาว 30 นาที.wav");
await waitFor("return !document.querySelector('[data-qstop]')", 60000);
await inv("dev_fake_free", { bytes: 0 });
check("ที่ว่างในไดรฟ์ไม่พอ ไม่เริ่มแปลง บอกต้องใช้เท่าไหร่ มีว่างเท่าไหร่ ไม่มีไฟล์ค้าง", space.includes("ที่ว่างในไดรฟ์ D ไม่พอ") && space.includes("ต้องใช้ราว") && leftovers().length === 0, space.slice(0, 200));
// ไฟล์อื่นในคิวทำต่อตามปกติ (ที่ว่างหลอกกลับเป็นของจริงแล้วตอนนี้ บางไฟล์อาจไม่สำเร็จด้วยที่ว่างหลอก) · คืนทุกแถวเป็นรอคิว
for (const n of ORDER.slice(0, ORDER.length - 1)) await q(`const r = ${row(n)}; r?.querySelector('[data-qretry]')?.click(); return 1`);
await sleep(300);
const done0 = await q("return [...document.querySelectorAll('[data-qrow]')].filter(r => r.dataset.qstate === 'done').map(r => r.dataset.qrow)");
for (const n of done0) {
  // ไฟล์ที่แปลงไปแล้วตอนที่ว่างหลอก ลบทิ้งแล้วเอาออกจากคิว เพิ่มใหม่ ให้รอบจริงเริ่มจากศูนย์
  const out = await q(`return ${row(n)}.querySelector('[data-qdone] .small').title`);
  if (out && existsSync(out)) rmSync(out);
}
if (done0.length) {
  await c.evaluate("document.querySelector('[data-qclear]')?.click()");
  await drop(done0.map(F));
  await waitFor(`return document.querySelectorAll('[data-qrow]').length === ${ORDER.length}`, 20000);
}

/* ---------- 6 หยุดทั้งคิว ---------- */
await c.click("[data-qstart]");
await waitFor(`return (${row("ยาว 30 นาที.wav")}?.querySelector('[data-qwork] .small')?.innerText ?? '').match(/^(\\d+)%/)?.[1] >= 3`, 60000);
const work = await rowText("ยาว 30 นาที.wav");
const btn = await q("return document.querySelector('[data-qstart]').innerText");
await shot("24-กำลังแปลง.png", "[data-convert]", 4);
check("กำลังแปลงไฟล์แรก แถบความคืบหน้าบอกเปอร์เซ็นต์กับเวลาที่เหลือ · ปุ่มบอกว่ากำลังแปลงไฟล์ที่เท่าไหร่จากกี่ไฟล์", work.includes("%") && work.includes("เหลือราว") && btn.includes(`กำลังแปลง 1 จาก ${ORDER.length - 1}`), `${work.slice(0, 140)} · ${btn}`);
await c.click("[data-qstop]");
await waitFor(`return ${row("ยาว 30 นาที.wav")}?.dataset.qstate === 'stop'`, 30000);
await waitFor("return !document.querySelector('[data-qstop]')", 10000);
await sleep(500);
const stopped = await q("return [...document.querySelectorAll('[data-qrow]')].map(r => r.dataset.qstate).join(',')");
check("กดหยุดทั้งคิว ไฟล์ที่กำลังทำขึ้นหยุดแล้ว ไฟล์ทำค้างถูกลบ ไฟล์ที่เหลือรอคิวเหมือนเดิม", stopped === "stop,wait,wait,wait,wait,wait,wait,fail" && leftovers().length === 0 && !existsSync(F("ยาว 30 นาที.ape")), `${stopped} · ค้าง ${leftovers().join(",") || "ไม่มี"}`);

/* ---------- 7 แปลงจริงทุกไฟล์ ---------- */
await c.click("[data-qstart]");
await waitFor("return !document.querySelector('[data-qstop]') && ![...document.querySelectorAll('[data-qrow]')].some(r => r.dataset.qstate === 'wait' || r.dataset.qstate === 'work')", 240000);
const states = await q("return Object.fromEntries([...document.querySelectorAll('[data-qrow]')].map(r => [r.dataset.qrow, r.dataset.qstate]))");
check("แปลงต่อ 6 ไฟล์ที่รอ เสร็จครบ · ไฟล์ที่หยุดไว้ไม่ถูกเริ่มเอง", ["เพลงทดสอบ 96k.flac", "เพลงทดสอบ.wav", "เพลงทดสอบ.mp3", "พากย์ไทย 5.1.ac3", "เพลงทดสอบ 96k สำเนา.flac", "เพลงทดสอบ 96k TAK.flac"].every((n) => states[n] === "done") && states["ยาว 30 นาที.wav"] === "stop", JSON.stringify(states));
const probe = async (n) => { try { return await inv("convert_probe", { path: F(n) }); } catch (e) { return { err: String(e) }; } };
const tag = (f, k) => f.tags?.find((t) => t.key === k)?.value;
const opus = await probe("เพลงทดสอบ 96k.opus");
check("FLAC เป็น Opus ด้วย opusenc · ชื่อเพลงภาษาไทย ศิลปิน อัลบั้ม ปี แทร็ก กับรูปปกติดไป · ยาวเท่าเดิม", opus.codec === "opus" && tag(opus, "title") === "เพลงทดสอบ 96k" && tag(opus, "artist") === "วงทดสอบ" && tag(opus, "track") === "3" && !!opus.cover && Math.abs(opus.duration - 30) < 0.2,
  `${opus.codec} · ${opus.tags?.map((t) => t.key + "=" + t.value).join(" ")} · ปก ${opus.cover ? opus.cover.width + "×" + opus.cover.height : "ไม่มี"} · ${opus.duration}`);
const ape2 = await probe("เพลงทดสอบ (2).ape");
check("WAV เป็น Monkey's Audio ชื่อชน ได้ เพลงทดสอบ (2).ape · ไฟล์ชื่อเดิมไม่ถูกแตะ", ape2.codec === "ape" && sha(F("เพลงทดสอบ.ape")) === hBlock, `${ape2.codec ?? ape2.err} · ${readFileSync(F("เพลงทดสอบ.ape"), "utf8")}`);
const md5 = (p) => execFileSync(FF, ["-v", "error", "-i", p, "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "md5", "-"]).toString().trim();
check("Monkey's Audio ถอดกลับได้เสียงตรงต้นฉบับ WAV ทุกตัวอย่าง (MD5 ของเสียงดิบเท่ากัน)", md5(F("เพลงทดสอบ (2).ape")) === md5(F("เพลงทดสอบ.wav")));
const flac = await probe("เพลงทดสอบ.flac");
check("MP3 เป็น FLAC · ffmpeg ใส่ข้อมูลเพลงกับปกจากไฟล์เดิม", flac.codec === "flac" && tag(flac, "title") === tag(await probe("เพลงทดสอบ.mp3"), "title") && !!tag(flac, "title") && !!flac.cover, `${flac.codec} · ${tag(flac, "title")} · ปก ${!!flac.cover}`);
const wv = await probe("พากย์ไทย 5.1.wv");
check("AC-3 5.1 เป็น WavPack ได้ 6 ช่อง", wv.codec === "wavpack" && wv.channels === 6 && wv.layout === "5.1", `${wv.codec} · ${wv.channels} · ${wv.layout}`);
const apeTag = await probe("เพลงทดสอบ 96k สำเนา.ape");
check("FLAC เป็น Monkey's Audio · แท็ก APEv2 ที่โปรแกรมเขียนเอง ชื่อเพลงไทยกับรูปปกอ่านกลับได้", apeTag.codec === "ape" && tag(apeTag, "title") === "เพลงทดสอบ 96k" && tag(apeTag, "date") === "2024" && !!apeTag.cover, `${apeTag.tags?.map((t) => t.key + "=" + t.value).join(" ")} · ปก ${!!apeTag.cover}`);
const takF = await probe("เพลงทดสอบ 96k TAK.tak");
const takRes = await q(`return ${row("เพลงทดสอบ 96k TAK.flac")}.querySelector('[data-qresult]').innerText.replace(/\\s+/g, ' ')`);
check("FLAC เป็น TAK ด้วย Takc ที่แตกจากชุดที่แนบมา · แท็ก APEv2 ชื่อเพลงไทยกับรูปปกอ่านกลับได้ · ถอดกลับเสียงตรงต้นฉบับทุกตัวอย่าง",
  takF.codec === "tak" && tag(takF, "title") === "เพลงทดสอบ 96k" && !!takF.cover && md5(F("เพลงทดสอบ 96k TAK.tak")) === md5(F("เพลงทดสอบ 96k TAK.flac")) && takRes.includes("Takc"),
  `${takF.codec ?? takF.err} · ${takF.tags?.map((t) => t.key + "=" + t.value).join(" ")} · ปก ${!!takF.cover} · ${takRes.slice(0, 120)}`);
const same = ORDER.every((n) => sha(F(n)) === h0[n]);
check("ไฟล์เดิมทุกไฟล์ hash เท่าก่อนแปลง · ไม่มีไฟล์ .partial ค้าง", same && leftovers().length === 0, leftovers().join(","));
const res = await q(`return ${row("เพลงทดสอบ 96k.flac")}.querySelector('[data-qresult]').innerText.replace(/\\s+/g, ' ')`);
const st = await q(`return ${row("เพลงทดสอบ 96k.flac")}.querySelector('[data-qdone]').innerText.replace(/\\s+/g, ' ')`);
check("แถวที่เสร็จบอกขนาดใหม่ เล็กลงกี่เปอร์เซ็นต์ ข้อมูลเพลงกี่ช่อง รูปปก ตัวแปลงกับรุ่น", st.startsWith("เสร็จ") && st.includes("เล็กลง") && res.includes("ข้อมูลเพลง 5 ช่องติดไปด้วยพร้อมรูปปก") && res.includes("opusenc"), `${st} · ${res}`);
const wvRes = await q(`return ${row("พากย์ไทย 5.1.ac3")}.querySelector('[data-qresult]').innerText.replace(/\\s+/g, ' ')`);
check("ไฟล์ที่ไม่มีข้อมูลเพลง บอกว่าไม่มี ไม่แต่งขึ้นเอง", wvRes.includes("ไม่มีข้อมูลเพลง") && wvRes.includes("ไม่มีรูปปก"), wvRes);
await shot("25-คิวแปลงเสร็จ.png", "[data-convert]", 4);

/* ---------- 8 ข้อมูลเพลง ---------- */
await c.click('[data-qrow="เพลงทดสอบ 96k.flac"] [data-qname]');
await waitFor("return !!document.querySelector('[data-tagkv]') && !!document.querySelector('img[data-tagart]')", 10000);
const kv = await q("return document.querySelector('[data-tagview]').innerText.replace(/\\s+/g, ' ')");
check("กดชื่อไฟล์ ดูข้อมูลเพลงกับรูปปก ชื่อเพลง ศิลปิน อัลบั้ม ปี แทร็ก รูปปก JPG ขนาด", kv.includes("ชื่อเพลง เพลงทดสอบ 96k") && kv.includes("ศิลปิน วงทดสอบ") && kv.includes("อัลบั้ม อัลบั้มทดสอบ") && kv.includes("ปี 2024") && kv.includes("แทร็ก 3") && /รูปปก JPG [\d,]+ × [\d,]+ ขนาด [\d.]+ (KB|MB)/.test(kv), kv.slice(0, 220));
await shot("26-ข้อมูลเพลง.png", ".dlg", 4);
await clickText(".dlg .acts button", "ปิด");
await sleep(300);
await c.click('[data-qrow="เพลงทดสอบ.wav"] [data-qname]');
await waitFor("return !!document.querySelector('[data-tagnone]')", 10000);
const none = await q("return document.querySelector('[data-tagview]').innerText.replace(/\\s+/g, ' ')");
check("ไฟล์ WAV ไม่มีข้อมูลเพลง บอกว่าไม่มีพร้อมเหตุ ไม่มีรูปปก", none.includes("ไฟล์นี้ไม่มีข้อมูลเพลง") && none.includes("WAV") && none.includes("ไม่มีรูปปก"), none.slice(0, 160));
await shot("27-ไม่มีข้อมูลเพลง.png", ".dlg", 4);
await c.key("Escape");
await sleep(300);

/* ---------- 9 เทียบสองไฟล์ ---------- */
await c.click('[data-qrow="เพลงทดสอบ 96k.flac"] [data-qcmp]');
await waitFor("return !!document.querySelector('[data-compare]') && !document.querySelector('[data-cmploading]')", 120000);
const chips = await q("return [...document.querySelectorAll('[data-cmpfile]')].map(x => x.innerText.replace(/\\s+/g, ' ')).join(' | ')");
check("กดเทียบความถี่ เปิดหน้ากราฟเสียงแบบสองไฟล์ ต้นฉบับกับหลังแปลง", chips.includes("เพลงทดสอบ 96k FLAC ต้นฉบับ") && chips.includes("เพลงทดสอบ 96k OPUS หลังแปลง"), chips.slice(0, 200));
const info = await q("return document.querySelector('[data-cmpinfo]').innerText.replace(/\\s+/g, ' ')");
check("ข้อมูลเสียงสองคอลัมน์ FLAC 96 kHz 24-bit เทียบ Opus 48 kHz · บอกตัวแปลงที่ใช้", info.includes("FLAC") && info.includes("Opus") && info.includes("96 kHz") && info.includes("48 kHz") && info.includes("24-bit") && (await q("return document.querySelector('.apanel').innerText")).includes("ด้วย opusenc"), info.slice(0, 200));
const tabs = [["wave", "รูปคลื่น"], ["loud", "ความดัง"], ["cmp", "ซ้อนเทียบ"], ["spek", "ความถี่"], ["psd", "ความถี่เฉลี่ย"]];
const ink = {};
for (const [k] of tabs) {
  await c.click(`[data-cmptab="${k}"]`);
  await sleep(500);
  if (k === "psd") await waitFor("return !!document.querySelector('[data-cmppsd]')", 60000);
  await sleep(300);
  // สัดส่วนจุดภาพที่ไม่ใช่สีพื้นของทุกกราฟในแท็บ · เอาค่าที่น้อยสุด (กราฟที่ว่างเปล่าได้ 0)
  const r = await q(`return [...document.querySelectorAll('[data-cmpview] canvas.cv')].map(cv => { if (!cv.width) return 0; const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0, m = 0; for (let j = 0; j < d.length; j += 4 * 7) { m++; if (Math.abs(d[j] - d[0]) + Math.abs(d[j + 1] - d[1]) + Math.abs(d[j + 2] - d[2]) > 30) n++; } return n / m; })`);
  ink[k] = { n: r.length, worst: Math.round(Math.min(1, ...r) * 1000) / 1000 };
}
check("ทั้ง 5 แท็บวาดจากข้อมูลจริงของสองไฟล์ ทุกกราฟมีเส้นหรือสี", tabs.every(([k]) => ink[k].n >= (k === "wave" ? 4 : 1) && ink[k].worst > 0.01), JSON.stringify(ink));
await c.click('[data-cmptab="spek"]');
await sleep(600);
const spekStat = await q("return document.querySelector('[data-cmpstat]').innerText.replace(/\\s+/g, ' ')");
check("แท็บวิเคราะห์ บอกว่าหลังแปลงไม่มีเสียงเหนือราว 20 kHz ต้นฉบับมีเสียงสูงกว่านั้น", /หลังแปลงไม่มีเสียงเหนือ (19|20|21)(\.\d)? kHz/.test(spekStat), spekStat.slice(0, 160));
await shot("28-เทียบ-วิเคราะห์.png", "[data-compare]", 4);
await c.click('[data-cmptab="wave"]');
await sleep(600);
await shot("29-เทียบ-รูปคลื่น.png", "[data-compare]", 4);
await c.click('[data-cmptab="psd"]');
await waitFor("return !!document.querySelector('[data-cmppsd]')", 60000);
await sleep(300);
const pb = await c.box("[data-cmppsd]");
await c.move(pb.left + pb.w * 0.35, pb.top + pb.h * 0.5);
await sleep(400);
const read = await q("return document.querySelector('[data-cmppsdread]').innerText.replace(/\\s+/g, ' ')");
check("แท็บความถี่เฉลี่ย ชี้แล้วบอกค่าของสองไฟล์กับผลต่าง", read.includes("ต้นฉบับ") && read.includes("หลังแปลง") && read.includes("ต่าง") && read.includes("Hz"), read.slice(0, 200));
await c.shot(`${OUT}/30-เทียบ-ความถี่เฉลี่ย.png`, "[data-compare]", 4);
await c.click('[data-cmptab="loud"]');
await sleep(600);
const tiles = await q("return document.querySelector('[data-cmptiles]').innerText.replace(/\\s+/g, ' ')");
check("แท็บความดัง ทุกช่องบอกค่าของสองไฟล์ ความดังรวม ยอดเสียง ช่วงความดัง ช่วงเงียบ", (tiles.match(/ต้นฉบับ/g) ?? []).length === 4 && (tiles.match(/หลังแปลง/g) ?? []).length === 4 && tiles.includes("LUFS"), tiles.slice(0, 200));
// ซ่อนช่องใช้กับสองไฟล์พร้อมกัน
await c.click('[data-cmptab="wave"]');
await sleep(400);
const lanes0 = await q("return document.querySelectorAll('[data-cmpview] .lane').length");
await c.click(".apanel svg.spk g.s");
await sleep(400);
const lanes1 = await q("return document.querySelectorAll('[data-cmpview] .lane').length");
check("กดลำโพงปิดช่อง ปิดทั้งสองไฟล์พร้อมกัน แถบอยู่ครบ ขึ้นปิดลำโพง 2 แถบ", lanes0 === 4 && (await q("return document.querySelectorAll('[data-cmpview] .lane[data-off]').length")) === 2 && lanes1 === 4, `${lanes0} → ${lanes1}`);
await c.click('[data-cmpzoom="30"]');
await sleep(500);
const head = await q("return document.querySelector('[data-cmpview] .plothead').innerText");
check("ซูม 30 วินาที ใช้กับสองไฟล์พร้อมกัน", head.includes("0:15 ถึง 0:30") || /\d:\d\d ถึง \d:\d\d/.test(head), head.slice(0, 80));
await c.click("[data-cmpback]");
await waitFor("return !!document.querySelector('[data-convert]')", 5000);
check("กดคิวแปลง กลับหน้าคิว แถวครบเหมือนเดิม", (await q("return document.querySelectorAll('[data-qrow]').length")) === ORDER.length);

/* ---------- 10 เปลี่ยนหน้าแล้วคิวไม่หาย · ตั้งค่าตัวแปลง ---------- */
await clickText(".side .nav", "ตั้งค่า");
await c.setNav("encoders");
await waitFor("return !!document.querySelector('[data-setcard=encoders] [data-enc]')", 20000);
await waitFor("return [...document.querySelectorAll('[data-setcard=encoders] [data-enc]')].length >= 9", 20000);
const enc = await q("return [...document.querySelectorAll('[data-setcard=encoders] [data-enc]')].map(r => r.innerText.replace(/\\s+/g, ' ')).join(' | ')");
check("หน้าตั้งค่ามีการ์ด Monkey's Audio 13.46 (MACDll64 จากตัวติดตั้งของผู้ทำ) กับ TAK 2.3.3 แนบมากับโปรแกรม พร้อมใช้งาน", /MACDll64[^|]*13\.46/.test(enc) && /Takc[^|]*2\.3\.3 แนบมากับโปรแกรม[^|]*พร้อมใช้งาน/.test(enc), enc.split(" | ").filter((x) => x.includes("MACDll64") || x.includes("Takc")).join(" | "));
await clickText(".side .nav", "กราฟเสียง");
await waitFor("return !!document.querySelector('[data-convert]')", 5000);
check("ไปหน้าอื่นแล้วกลับมา ยังอยู่โหมดแปลงเสียง คิวกับผลอยู่ครบ", (await q("return document.querySelectorAll('[data-qrow][data-qstate=done]').length")) === 6);
await c.click('[data-qrow="ไม่มีเสียง.mp4"] [data-qremove]');
await sleep(300);
await c.click("[data-qclear]");
await sleep(300);
const left = await q("return [...document.querySelectorAll('[data-qrow]')].map(r => r.dataset.qrow).join(',')");
check("กดกากบาทเอาไฟล์ออกจากคิว · เอาไฟล์ที่เสร็จออกจากคิว เหลือแต่ไฟล์ที่หยุดไว้ · ไฟล์ในเครื่องไม่ถูกแตะ", left === "ยาว 30 นาที.wav" && existsSync(F("ไม่มีเสียง.mp4")) && existsSync(F("เพลงทดสอบ 96k.opus")), left);
await c.click('[data-gmode="graph"]');
await waitFor("return !document.querySelector('[data-convert]')", 5000);

if (BUILT) {
  const csp = await q("return window.__csp ?? null");
  check("ตัวโปรแกรมที่สร้างจริง ไม่มีอะไรโดนกติกาความปลอดภัยกันตลอดการเทส (รูปปกเป็น data URL)", Array.isArray(csp) && csp.length === 0, JSON.stringify(csp));
}
writeFileSync(`${OUT}/ผลเทส-แปลงเสียง.json`, JSON.stringify(results, null, 2) + "\n");
const failed = results.filter((r) => !r.pass);
console.log(`\nผ่าน ${results.length - failed.length} จาก ${results.length} ข้อ`);
c.close();
process.exit(failed.length ? 1 : 0);
