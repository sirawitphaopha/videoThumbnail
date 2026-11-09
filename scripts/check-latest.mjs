// ตัวตรวจปุ่มเช็กรุ่นล่าสุดของตัวแปลงเสียงในหน้าตั้งค่า (latest.rs · พี่กันสั่ง 8 พ.ย. 2569)
// ออกเน็ตจริงไปหน้าเว็บผู้ทำ (อ่านอย่างเดียว) · ไม่กดปุ่มเปิดหน้าโหลด (เบราว์เซอร์จะเด้งขึ้นจอ)
// สถานะที่ของจริงยังไม่เกิด (มีรุ่นใหม่ เช็กไม่ได้ ใหม่กว่าหน้าเว็บ) ป้อนผลจำลองผ่าน window.__latestSample ซึ่งมีเฉพาะรุ่นทดสอบ
// ใช้: node scripts/check-latest.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1)
import { mkdirSync, writeFileSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-07/เสียงซับ-ขั้น2";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const waitFor = async (js, ms = 30000) => { for (let t = 0; t < ms; t += 200) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(200); } return false; };
// การ์ดตัวแปลงสูงกว่าจอ · ขยายพื้นที่ถ่ายชั่วคราว (ไม่ขยับหน้าต่างจริง) ให้เห็นทั้งการ์ด แล้วคืนค่า
const shot = async (f, sel) => {
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1400, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await c.evaluate(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' })`);
  await c.move(5, 1390); await sleep(300);
  const r = await c.shot(`${OUT}/${f}`, sel, 6);
  await c.send("Emulation.clearDeviceMetricsOverride");
  return r;
};
const rows = () => q("return Object.fromEntries([...document.querySelectorAll('[data-setcard=encoders] [data-enc]')].map(r => { const l = r.querySelector('[data-latest]'); return [r.dataset.enc, l ? l.dataset.latest + ' | ' + l.innerText.replace(/\\s+/g, ' ') + ' | ' + !!l.querySelector('[data-latest-page]') : '-']; }))");
const bar = () => q("return document.querySelector('[data-latest-bar]').innerText.replace(/\\s+/g, ' ')");

await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('ตั้งค่า')).click()");
await c.setNav("encoders");
await waitFor("return document.querySelectorAll('[data-setcard=encoders] [data-enc]').length >= 9", 30000);
await c.evaluate("delete window.__latestSample; document.querySelector('[data-setcard=encoders]').scrollIntoView({ block: 'center' })");
await sleep(300);

/* ---------- 1 ยังไม่กด ไม่ออกเน็ตเอง ---------- */
const b0 = await bar();
const r0 = await rows();
const fresh = Object.values(r0).every((v) => v === "-");
check("เปิดหน้าตั้งค่าแล้วยังไม่เช็กเอง · มีปุ่มเช็กรุ่นล่าสุด บอกว่าออกเน็ตเฉพาะตอนกด ไม่โหลดอะไรมาเปลี่ยนเอง", (fresh && b0.includes("ออกเน็ตไปดูหน้าเว็บผู้ทำเฉพาะตอนกด")) || b0.includes("เช็กรุ่นล่าสุดกับเว็บผู้ทำเมื่อ"), b0.slice(0, 140));

/* ---------- 2 กดเช็กของจริง ---------- */
const t0 = Date.now();
await c.click("[data-enclatest]");
await sleep(150);
const busy = await q("return document.querySelector('[data-enclatest]').innerText + ' · ' + document.querySelector('[data-enclatest]').getAttribute('aria-disabled')");
const got = await waitFor("return document.querySelector('[data-enclatest]').innerText === 'เช็กรุ่นล่าสุด' && document.querySelector('[data-latest-bar]').innerText.includes('เมื่อ')", 90000);
const secs = ((Date.now() - t0) / 1000).toFixed(1);
check("กดแล้วปุ่มขึ้นกำลังเช็ก กดซ้ำไม่ได้ ระหว่างรอ", busy === "กำลังเช็ก · true", busy);
const r1 = await rows();
const b1 = await bar();
const bundled = ["flac", "opusenc", "lame", "wavpack", "MACDll64", "Takc", "ffmpeg"];
check(`เช็กเสร็จใน ${secs} วินาที · ตัวที่แนบมาทั้ง 7 ตัวเป็นรุ่นล่าสุดตามหน้าเว็บผู้ทำ (flac opusenc lame wavpack Monkey's Audio TAK ffmpeg)`,
  got && bundled.every((n) => r1[n]?.startsWith("ok | ล่าสุดแล้ว")), bundled.map((n) => `${n} ${r1[n]}`).join(" · "));
check("qaac fdkaac ที่ยังไม่ได้ใส่ บอกรุ่นล่าสุดบนเว็บพร้อมปุ่มเปิดหน้าโหลด", ["qaac64", "fdkaac"].every((n) => r1[n]?.startsWith("missing | รุ่นล่าสุดบนเว็บ") && r1[n].endsWith("| true")), `qaac64 ${r1.qaac64} · fdkaac ${r1.fdkaac}`);
check("แถบบนสรุปเวลาที่เช็ก ล่าสุดแล้ว 7 มีรุ่นใหม่ 0 ยังไม่ได้ใส่ 2 เช็กไม่ได้ 0", b1.includes("ล่าสุดแล้ว 7") && b1.includes("มีรุ่นใหม่ 0") && b1.includes("ยังไม่ได้ใส่ 2") && b1.includes("เช็กไม่ได้ 0"), b1);
await c.evaluate("document.querySelector('[data-setcard=encoders]').scrollIntoView({ block: 'center' })");
await shot("34-เช็กรุ่นล่าสุด.png", "[data-setcard=encoders]");

/* ---------- 3 ไปหน้าอื่นแล้วกลับมา ผลยังอยู่ ไม่ออกเน็ตซ้ำ ---------- */
await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('ชั้นวาง')).click()");
await sleep(500);
await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('ตั้งค่า')).click()");
await waitFor("return document.querySelectorAll('[data-setcard=encoders] [data-enc]').length >= 9", 30000);
check("ไปหน้าอื่นแล้วกลับมา ผลเช็กยังอยู่ ปุ่มไม่ได้เช็กซ้ำเอง", (await bar()) === b1 && (await q("return document.querySelector('[data-enclatest]').innerText")) === "เช็กรุ่นล่าสุด", await bar());

/* ---------- 4 ทุกสถานะ (ผลจำลอง เฉพาะรุ่นทดสอบ) ---------- */
const sample = [
  { name: "flac", installed: "1.5.0", latest: "1.5.1", state: "new", from: "Xiph", error: null },
  { name: "opusenc", installed: "libopus 1.6.1", latest: "1.6.1", state: "ok", from: "RareWares (รุ่น libopus ในชุด)", error: null },
  { name: "lame", installed: "4.0", latest: "4.0", state: "ok", from: "RareWares", error: null },
  { name: "wavpack", installed: "5.9.0", latest: "5.8.1", state: "ahead", from: "WavPack (GitHub)", error: null },
  { name: "MACDll64", installed: "13.46", latest: null, state: "error", from: "Monkey's Audio", error: "ต่อเว็บไม่ได้หรือรอนานเกิน" },
  { name: "qaac64", installed: null, latest: "3.07", state: "missing", from: "qaac (GitHub)", error: null },
  { name: "fdkaac", installed: null, latest: "1.0.9", state: "missing", from: "fdkaac (GitHub)", error: null },
  { name: "Takc", installed: "2.3.3", latest: "2.3.3", state: "ok", from: "TAK (Thomas Becker)", error: null },
  { name: "ffmpeg", installed: "9.0.2", latest: "9.0.2", state: "ok", from: "gyan.dev (ชุด full build ที่แนบมา)", error: null },
];
await c.evaluate(`window.__latestSample = ${JSON.stringify(sample)}`);
await c.click("[data-enclatest]");
await waitFor("return document.querySelector('[data-latest-bar]').innerText.includes('มีรุ่นใหม่ 1')", 10000);
const r2 = await rows();
const b2 = await bar();
check("มีรุ่นใหม่ บอกรุ่นใหม่ รุ่นที่ใช้อยู่ พร้อมปุ่มเปิดหน้าโหลด", r2.flac === "new | มีรุ่นใหม่ 1.5.1 · ใช้อยู่ 1.5.0 · เปิดหน้าโหลด | true", r2.flac);
check("ที่ใช้อยู่ใหม่กว่าหน้าเว็บ บอกตรง ๆ ไม่ขึ้นว่ามีรุ่นใหม่", r2.wavpack.startsWith("ahead | ใหม่กว่าหน้าเว็บ") && r2.wavpack.includes("5.8.1"), r2.wavpack);
check("เช็กไม่ได้ บอกเหตุ ไม่เดาเลข", r2.MACDll64 === "error | เช็กไม่ได้ · ต่อเว็บไม่ได้หรือรอนานเกิน | false", r2.MACDll64);
check("แถบบนนับทุกสถานะ ล่าสุดแล้ว 5 (รวมที่ใหม่กว่าหน้าเว็บ) มีรุ่นใหม่ 1 ยังไม่ได้ใส่ 2 เช็กไม่ได้ 1", b2.includes("ล่าสุดแล้ว 5") && b2.includes("มีรุ่นใหม่ 1") && b2.includes("ยังไม่ได้ใส่ 2") && b2.includes("เช็กไม่ได้ 1"), b2);
await c.evaluate("document.querySelector('[data-setcard=encoders]').scrollIntoView({ block: 'center' })");
await shot("35-เช็กรุ่นล่าสุด-ทุกสถานะ.png", "[data-setcard=encoders]");
// คืนเป็นผลจริง ไม่ทิ้งผลจำลองไว้ในโปรแกรม
await c.evaluate("delete window.__latestSample");
await c.click("[data-enclatest]");
await waitFor("return document.querySelector('[data-enclatest]').innerText === 'เช็กรุ่นล่าสุด' && document.querySelector('[data-latest-bar]').innerText.includes('มีรุ่นใหม่ 0')", 90000);
check("ลบผลจำลองแล้วกดเช็กใหม่ กลับเป็นผลจริงจากเว็บผู้ทำ", (await bar()).includes("ล่าสุดแล้ว 7"), await bar());

const pass = results.filter((r) => r.pass).length;
writeFileSync(`${OUT}/ผลเทส-เช็กรุ่นล่าสุด.json`, JSON.stringify(results, null, 2));
console.log(`ผ่าน ${pass} จาก ${results.length}`);
process.exitCode = pass === results.length ? 0 : 1;
await c.close?.();
