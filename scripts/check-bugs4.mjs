// ตัวตรวจบั๊กชุด 4 หน้ากราฟเสียง รูปคลื่น ข้อ 11 12 17 18 (docs/BUGS.md จัดหมวด 11 พ.ย. 2569)
// เปิดโปรแกรมโหมดพัฒนาก่อน · ไม่กดปุ่มเลือกไฟล์ ไม่กดบันทึกรูป · ภาพลง docs/report-2026-11-11/ชุด4/
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync } from "node:fs";

const ROOT = "D:/movie-shelf";
const OUT = `${ROOT}/docs/report-2026-11-11/ชุด4`; mkdirSync(OUT, { recursive: true });
const SONG = `${ROOT}/test-media/สร้าง/เสียงซับ/เพลงทดสอบ 96k.flac`;
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const waitFor = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(150); } return false; };
const nav = async (label) => { await q(`[...document.querySelectorAll("button,a")].find(b => b.innerText.trim().split(/\\s*\\n/)[0] === ${JSON.stringify(label)})?.click()`); await sleep(500); };
const G = "[data-pageslot=graph]";
const open = async () => {
  await nav("กราฟเสียง");
  await c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: [${JSON.stringify(SONG)}], position: { x: 700, y: 400 } } })`);
  await waitFor(`return (document.querySelector('${G} .fchip .nm')?.innerText ?? '').startsWith('เพลงทดสอบ 96k')`, 15000); await sleep(2500);
  await q(`document.querySelector('${G} [data-view=wave]')?.click()`); await sleep(800);
};
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
// ค่าที่เคยจำเส้นละเอียดไว้ เปิดมาต้องเป็นแบบหลัก
await q(`const p = JSON.parse(localStorage.getItem('graph-prefs') ?? '{}'); p.style = 'fine'; localStorage.setItem('graph-prefs', JSON.stringify(p)); localStorage.removeItem('graph-ov-fold');`);
await c.evaluate("location.hash = ''; location.reload()"); await sleep(3000);
await open();

const st = await q(`return { on: document.querySelector('${G} [data-style].on')?.dataset.style, inHead: !!document.querySelector('${G} .plothead [data-style=bars]'), inTop: !!document.querySelector('${G} .agctl [data-style]'), labels: [...document.querySelectorAll('${G} .plothead [data-style]')].map(b => b.innerText.trim()) }`);
check("ข้อ 12 เปิดมาเป็นแบบหลัก (ค่าเดิมที่จำเส้นละเอียดไว้ก็เปลี่ยนเป็นแบบหลัก) · ปุ่มแบบย้ายจากแถวบนลงหัวการ์ด · ชื่อปุ่มไม่มีคำว่า Audacity", st.on === "aud" && st.inHead && !st.inTop && !st.labels.some((l) => /Audacity/.test(l)), JSON.stringify(st));
const lg = await q(`const l = document.querySelector('${G} .agfoot .lg'); return { txt: l?.innerText.replace(/\\s+/g, ' '), info: !!l?.querySelector('button'), peak: [...document.querySelectorAll('${G} .lane, ${G} [data-lanes] .lname, ${G} [data-lanes]')].map(x => x.innerText).join(' ').match(/(ยอด|ดังสุด) [−-]?[\\d.]+ dB/)?.[0] }`);
check("ข้อ 11 ป้ายสีเขียน ดังสุด (Peak) กับ ดังเฉลี่ย (RMS) มีปุ่ม ⓘ · ใต้ชื่อช่องเขียน ดังสุด ไม่ใช่ ยอด · หมายเหตุแบบตามโปรแกรม Audacity ใต้กราฟ", /ดังสุด \(Peak\)/.test(lg.txt ?? "") && /ดังเฉลี่ย \(RMS\)/.test(lg.txt ?? "") && /Audacity/.test(lg.txt ?? "") && lg.info && /^ดังสุด/.test(lg.peak ?? ""), JSON.stringify(lg));
await c.shot(`${OUT}/12-หัวการ์ดปุ่มแบบรูปคลื่น.png`, `${G} .plothead`, 4);
await c.shot(`${OUT}/11-ป้ายสีดังสุดดังเฉลี่ย.png`, `${G} .agfoot`, 4);
await c.shot(`${OUT}/12-รูปคลื่นแบบหลัก.png`, `${G} [data-plot]`, 0);
// ปุ่ม ⓘ กดแล้วขึ้นคำอธิบาย
await c.click(`${G} .agfoot .lg button`); await sleep(400);
const tip = await q(`return [...document.querySelectorAll('[role=dialog], [role=tooltip], .tipbox, .itip')].map(e => e.innerText).join(' ').slice(0, 120)`);
check("ข้อ 11 กดปุ่ม ⓘ ขึ้นคำอธิบายดังสุดกับดังเฉลี่ย", /ดังเฉลี่ย/.test(tip), tip);
await c.shot(`${OUT}/11-คำอธิบายดังสุดดังเฉลี่ย.png`, null).catch(() => {});
await c.key("Escape"); await sleep(300);

await q(`document.querySelector('${G} [data-style=real]').click()`); await sleep(900);
const realBg = await q(`const cv = [...document.querySelectorAll('${G} [data-lanes] canvas')].filter(x => x.offsetParent).sort((a, b) => b.width * b.height - a.width * a.height)[0]; const d = cv.getContext('2d').getImageData(3, 3, 1, 1).data; return [d[0], d[1], d[2]].join(',')`);
check("ข้อ 12 แบบคลื่นเต็มช่อง พื้นขาวแบบหน้าจอ Audacity", realBg === "255,255,255", realBg);
// ต่างจากแบบหลักชัด สีเดียวไม่มีดังเฉลี่ย ช่องติดกัน (พี่กันทัก "เต็มช่อง กับ รูปคลื่น ไม่เห็นต่างกันเลย")
const rl = await q(`const l = document.querySelector('${G} .agfoot .lg')?.innerText ?? ''; const ln = document.querySelector('${G} [data-lanes]'); return { rms: /ดังเฉลี่ย/.test(l), gap: getComputedStyle(ln).rowGap, colors: (() => { const cv = [...ln.querySelectorAll('canvas')].filter(x => x.offsetParent).sort((a, b) => b.width * b.height - a.width * a.height)[0]; const g = cv.getContext('2d'), d = g.getImageData(0, 0, cv.width, cv.height).data, set = new Set(); for (let i = 0; i < d.length; i += 16) set.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]); return set.size; })() }`);
check("ข้อ 12 แบบเต็มช่อง คลื่นสีเดียว ไม่มีแถบดังเฉลี่ยในป้าย ช่องคั่นเท่าแบบอื่น (พี่กันทัก \"มันไม่เท่ากันเลย\")", !rl.rms && rl.gap !== "0px" && rl.colors <= 4, JSON.stringify(rl));
// หัวการ์ดแคบ ปุ่มแบบกราฟเป็นดรอปดาวน์ แถบซูมไม่ถูกบีบ · หัวการ์ดกว้าง เป็นแถวปุ่ม (พี่กันสั่ง "มันบีบเส้นซูมเกินไป ให้เปลี่ยนรูปแบบกราฟเป็นดรอปดาวน์ ถ้าจอมันเล็ก")
const hd = () => q(`const h = document.querySelector('${G} .plothead'); return { w: Math.round(h.getBoundingClientRect().width), seg: getComputedStyle(h.querySelector('.wstyle-seg')).display, dd: getComputedStyle(h.querySelector('.wstyle-dd')).display, hz: Math.round(h.querySelector('.hzoom').getBoundingClientRect().width), over: h.scrollWidth > h.clientWidth + 1 }`);
const narrow = await hd();
check("หัวการ์ดแคบ (หน้าต่าง 1280 มีแผงลำโพง) ปุ่มแบบกราฟเป็นดรอปดาวน์ แถบซูมกว้างอย่างน้อย 120 จุด ไม่ล้น", narrow.seg === "none" && narrow.dd !== "none" && narrow.hz >= 120 && !narrow.over, JSON.stringify(narrow));
await c.shot(`${OUT}/12-หัวการ์ดแคบเป็นดรอปดาวน์.png`, `${G} .plothead`, 4);
await c.send("Emulation.setDeviceMetricsOverride", { width: 1700, height: 900, deviceScaleFactor: 1, mobile: false }); await sleep(900);
const wide = await hd();
check("หัวการ์ดกว้าง (หน้าต่าง 1700) ปุ่มแบบกราฟเป็นแถวปุ่ม ไม่ล้น", wide.seg !== "none" && wide.dd === "none" && !wide.over, JSON.stringify(wide));
await c.shot(`${OUT}/12-หัวการ์ดกว้างเป็นแถวปุ่ม.png`, `${G} .plothead`, 4);
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await sleep(600);
await c.shot(`${OUT}/12-คลื่นเต็มช่อง.png`, `${G} [data-plot]`, 0);
await q(`document.querySelector('${G} [data-style=bars]').click()`); await sleep(900);
await c.shot(`${OUT}/12-แท่งในการ์ด.png`, `${G} [data-plot]`, 0);
await q(`document.querySelector('${G} [data-style=aud]').click()`); await sleep(600);

// ข้อ 17 พับแถบภาพรวม
const h0 = await q(`return Math.round(document.querySelector('${G} [data-lanes] canvas').getBoundingClientRect().height)`);
await c.click(`${G} [data-ovtoggle]`); await sleep(800);
const f1 = await q(`return { fold: !!document.querySelector('${G} [data-ovfold]'), ovw: !!document.querySelector('${G} [data-ovw]'), h: Math.round(document.querySelector('${G} [data-lanes] canvas').getBoundingClientRect().height) }`);
check("ข้อ 17 กดพับแล้วเหลือแถบบางมีปุ่มกาง กราฟได้ที่สูงเพิ่ม", f1.fold && !f1.ovw && f1.h > h0, `สูง ${h0} → ${f1.h}`);
await c.shot(`${OUT}/17-พับแถบภาพรวม.png`, `${G} .plotstick`, 4);
await c.evaluate("location.hash = ''; location.reload()"); await sleep(3000); await open();
check("ข้อ 17 ปิดเปิดหน้าใหม่ยังจำค่าพับไว้", await q(`return !!document.querySelector('${G} [data-ovfold]')`));
await c.click(`${G} [data-ovtoggle]`); await sleep(500);
check("ข้อ 17 กดกางแล้วแถบภาพรวมกลับมา", await q(`return !!document.querySelector('${G} [data-ovw]')`));

// ข้อ 18 แถบเลื่อนบางลงครึ่งหนึ่ง ที่กดยังเท่าเดิม
await q(`document.querySelector('${G} [data-zoom="30"], ${G} button[data-zoom]')`);
await q(`[...document.querySelectorAll('${G} .plothead button')].find(b => b.innerText.trim() === '30 วินาที')?.click()`); await sleep(1200);
const sc = await q(`const t = document.querySelector('${G} [data-tscroll]'), th = t.querySelector('.thumb'); return { hit: Math.round(t.getBoundingClientRect().height), thumb: Math.round(th.getBoundingClientRect().height) }`);
check("ข้อ 18 แท่งแถบเลื่อนบาง 6 จุด (เดิม 10) ที่กดยังสูง 12 จุด", sc.thumb === 6 && sc.hit === 12, JSON.stringify(sc));
await c.shot(`${OUT}/18-แถบเลื่อนบางลง.png`, `${G} [data-tscroll]`, 8);
await q(`[...document.querySelectorAll('${G} .plothead button')].find(b => b.innerText.trim() === 'ทั้งไฟล์')?.click()`);
console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
process.exit(fail ? 1 : 0);
