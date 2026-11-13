// ตัวตรวจหน้าบิตเรตวิดีโอ (พี่กันสั่ง 10 พ.ย. 2569 "แปลงระบบการรันบิตเรต ตามเขาเลย และ UXUI ก็เอาตามเขา" · "เอามาให้หมด")
// เปิดโปรแกรมโหมดพัฒนาก่อน (scripts/dev-app.ps1) · ไม่กดปุ่ม Load ไม่กดปุ่มเลือกไฟล์ · เปิดไฟล์ผ่าน window.__bitrateOpen
// ไล่ 4 วิธีคิด · จำผลไม่อ่านใหม่ · ลากเลือกช่วงแล้วคลิกขวาซูม · ล้อขึ้นถอยออก · เส้นค่าเฉลี่ย สูงสุด ต่ำสุด · เมนู · ชนิดเฟรม I P B
// ภาพลง docs/report-2026-11-10/บิตเรต/
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const P = "D:/movie-shelf/docs/report-2026-11-10/บิตเรต"; mkdirSync(P, { recursive: true });
const TMP = "D:/dev/tmp/ชั้นบิตเรต"; mkdirSync(TMP, { recursive: true });
const FF = "D:/movie-shelf/src-tauri/tools/ffmpeg.exe";
// คลิป 60 วินาที บิตเรตแกว่ง GOP 50 เฟรม มี B เฟรม · ตัดฉากทุก 10 วินาทีให้มี GOP สั้นแทรก (ใช้ลอง GOP แบบถ่วง)
const CLIP = `${TMP}/บิตเรตแกว่ง.mkv`;
execFileSync(FF, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=duration=60:size=640x360:rate=25,noise=alls=40:allf=t+u:enable='between(mod(t,20),10,20)'",
  "-c:v", "libx264", "-g", "50", "-bf", "2", "-force_key_frames", "expr:eq(mod(n,250),245)", CLIP]);

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const q = (js) => c.evaluate(`(() => { ${js} })()`);
// เริ่มจากหน้าสด ไม่มีสถานะค้างจากรอบก่อน (เส้น ซูม เคอร์เซอร์)
await c.send("Page.reload"); await sleep(2500);
// ป้ายแกนซ้ายต้องไม่ทับกัน (เจอ 10 พ.ย. 2569 สเกลของโหมดต่อเฟรมทำให้ป้ายชนิดไฟล์ชน Max และ V: ทับ 5000)
const axisOk = () => q(`const ls = [...document.querySelectorAll('[data-bv-axis] > div')].map(d => d.getBoundingClientRect()).filter(r => r.height > 0); for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) { const a = ls[i], b = ls[j]; if (a.top < b.bottom - 1 && b.top < a.bottom - 1) return false; } return ls.length >= 4;`);
await q(`[...document.querySelectorAll('button,a')].find(b => b.innerText.trim() === 'บิตเรต')?.click()`);
await q(`window.__bitrateView?.('classic')`); await sleep(500); // หน้าแบบใหม่เป็นค่าตั้งต้นแล้ว ตัวตรวจนี้ตรวจแบบเดิม
await sleep(600);
const st = () => q(`const t = (s) => document.querySelector(s)?.innerText.replace(/\\s+/g, ' ').trim(); return { sample: t('[data-bv-sample]'), stats: t('[data-bv-stats]'), panel: t('[data-bv-panel]'), badge: t('[data-bv-badge]'), load: t('[data-bv-load]'), err: t('[data-bv-error]'), zoom: t('[data-bv-zoomflag]'), zstat: t('[data-bv-zoomstat]'), ftype: t('[data-bv-ftype]'), sel: t('[data-bv-sel]') }`);
const waitDone = async (ms = 60000) => { await sleep(400); const t = Date.now() - 400; for (;;) { const s = await st(); if (s.load === "Load" && (s.stats ?? "").includes("FRAMES")) return { s, sec: (Date.now() - t) / 1000 }; if (s.err || Date.now() - t > ms) return { s, sec: (Date.now() - t) / 1000 }; await sleep(150); } };
const pl = await c.box("[data-bv-plot]");
const mouse = async (type, x, y, extra = {}) => c.send("Input.dispatchMouseEvent", { type, x: pl.left + x, y: pl.top + y, ...extra });
const statNum = (s, k) => Number((s.stats.match(new RegExp(`${k} = (\\d+)`)) || [])[1]);

// ---------- ต่อวินาที ----------
await q(`window.__bitrateMode('sec')`); await sleep(200);
await q(`window.__bitrateOpen(${JSON.stringify(CLIP)})`);
let r = await waitDone();
check("ต่อวินาที อ่านจบ ป้าย SEC", r.s.badge === "SEC" && !r.s.err, `${r.sec.toFixed(1)} วินาที · ${r.s.stats}`);
check("ต่อวินาที FRAMES 1,500", statNum(r.s, "FRAMES") === 1500);
const secAvg = statNum(r.s, "AVG"), secMax = statNum(r.s, "MAX");
await mouse("mouseMoved", pl.w * 0.3, pl.h * 0.5); await sleep(150);
check("เคอร์เซอร์ขึ้นเวลาและบิตเรต พร้อมตัว (S)", /00:00:1\d:\d{3}/.test(r.s.panel = (await st()).panel) && /kbps \(S\)/.test(r.s.panel), r.s.panel);
check("ป้ายแกนซ้ายไม่ทับกัน โหมดต่อวินาที", await axisOk());
await c.shot(`${P}/01-ต่อวินาที.png`, "[data-bitrate]");

// ---------- ต่อ GOP · จำผล ----------
await q(`window.__bitrateMode('gop')`); r = await waitDone();
check("ต่อ GOP ป้าย GOP AVG ใกล้ต่อวินาที", r.s.badge === "GOP" && Math.abs(statNum(r.s, "AVG") - secAvg) / secAvg < 0.03, r.s.stats);
check("สลับวิธีไม่อ่านไฟล์ใหม่ (จำผล)", r.sec < 1.0, `${r.sec.toFixed(2)} วินาที`);
await c.shot(`${P}/02-ต่อGOP.png`, "[data-bitrate]");
await q(`window.__bitrateMode('gopx')`); r = await waitDone();
check("GOP แบบถ่วง ป้าย GOP X ยอดไม่สูงกว่าต่อ GOP", r.s.badge === "GOP X" && statNum(r.s, "MAX") <= secMax * 3, r.s.stats);

// ---------- ต่อเฟรม ----------
await q(`window.__bitrateMode('frm')`); r = await waitDone(120000);
check("ต่อเฟรม อ่านใหม่แบบถอดภาพ FRAMES 1,500 ป้าย FRAME", r.s.badge === "FRAME" && statNum(r.s, "FRAMES") === 1500, `${r.sec.toFixed(1)} วินาที · ${r.s.stats}`);
check("ต่อเฟรม MAX สูงกว่าต่อวินาที (เห็น I เฟรม)", statNum(r.s, "MAX") > secMax, `${statNum(r.s, "MAX")} > ${secMax}`);
await mouse("mouseMoved", pl.w * 0.5, pl.h * 0.5); await sleep(150);
let s = await st();
check("ชนิดเฟรมขึ้นข้างเวลาเคอร์เซอร์", /^[IPB]$/.test(s.ftype ?? ""), s.ftype);
await q(`document.querySelector('[data-bv-ftype]')?.click()`); await sleep(150);
s = await st();
check("กดชนิดเฟรมแล้วกระโดดไป I เฟรม", s.ftype === "I", s.panel);
check("ป้ายแกนซ้ายไม่ทับกัน โหมดต่อเฟรม", await axisOk());
await c.shot(`${P}/03-ต่อเฟรม.png`, "[data-bitrate]");

// ---------- ซูม ----------
await q(`window.__bitrateMode('sec')`); await waitDone();
await mouse("mousePressed", pl.w * 0.25, pl.h * 0.5, { button: "left", buttons: 1, clickCount: 1 });
for (let i = 1; i <= 6; i++) await mouse("mouseMoved", pl.w * (0.25 + i * 0.04), pl.h * 0.5, { buttons: 1 });
await mouse("mouseReleased", pl.w * 0.49, pl.h * 0.5, { button: "left", buttons: 0, clickCount: 1 });
await sleep(150); s = await st();
check("ลากเลือกช่วง ขึ้นกรอบส้มพร้อมเปอร์เซ็นต์", /%$/.test(s.sel ?? ""), s.sel);
await c.shot(`${P}/04-ลากเลือกช่วง.png`, "[data-bitrate]");
await mouse("mousePressed", pl.w * 0.37, pl.h * 0.5, { button: "right", buttons: 2, clickCount: 1 });
await mouse("mouseReleased", pl.w * 0.37, pl.h * 0.5, { button: "right", buttons: 0, clickCount: 1 });
await sleep(200); s = await st();
check("คลิกขวาในช่วงที่เลือก ซูมเข้า ขึ้น ZOOM 1", (s.zoom ?? "").startsWith("ZOOM 1") && !s.sel, s.zoom);
check("หัวกราฟบอกจำนวนตัวอย่างที่เห็นต่อทั้งหมด", /\d+ \/ 60 samples/.test(s.zstat ?? ""), s.zstat);
await c.shot(`${P}/05-ซูม.png`, "[data-bitrate]");
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: pl.left + pl.w / 2, y: pl.top + pl.h / 2, deltaX: 0, deltaY: 120 }); await sleep(200);
check("ล้อลงซูมเข้าอีกชั้น", ((await st()).zoom ?? "").startsWith("ZOOM 2"));
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: pl.left + pl.w / 2, y: pl.top + pl.h / 2, deltaX: 0, deltaY: -120 }); await sleep(100);
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: pl.left + pl.w / 2, y: pl.top + pl.h / 2, deltaX: 0, deltaY: -120 }); await sleep(200);
check("ล้อขึ้นถอยออกจนสุด", !(await st()).zoom);

// ---------- เส้นแนวนอนด้วยปุ่มพร้อมคลิก ----------
const px = await (async (x, y) => q(`const cv = document.querySelector('[data-bv-plot] canvas'); const g = cv.getContext('2d'); const d = window.devicePixelRatio || 1; return [...g.getImageData(0, 0, cv.width, cv.height).data].length`))();
const countColor = (rgb) => q(`const cv = document.querySelector('[data-bv-plot] canvas'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i]-${rgb[0]}) < 6 && Math.abs(d[i+1]-${rgb[1]}) < 6 && Math.abs(d[i+2]-${rgb[2]}) < 6) n++; return n;`);
const click = async (mods) => { await mouse("mousePressed", pl.w * 0.6, pl.h * 0.7, { button: "left", buttons: 1, clickCount: 1, modifiers: mods }); await mouse("mouseReleased", pl.w * 0.6, pl.h * 0.7, { button: "left", buttons: 0, clickCount: 1, modifiers: mods }); await sleep(150); };
const g0 = await countColor([0, 160, 0]);
await click(2); // Ctrl
const g1 = await countColor([0, 160, 0]);
check("Ctrl+คลิก ขึ้นเส้นค่าเฉลี่ยสีเขียว", px > 0 && g1 > g0 + 200, `${g0} → ${g1} จุด`);
await click(8); await click(1); // Shift แล้ว Alt
check("Shift+คลิก เส้นสูงสุดสีน้ำตาล · Alt+คลิก เส้นต่ำสุดสีน้ำเงิน", (await countColor([150, 90, 30])) > 200 && (await countColor([30, 60, 220])) > 200);
await c.shot(`${P}/06-เส้นสามสี.png`, "[data-bitrate]");
await click(2 | 8 | 1);
check("กดสามปุ่มพร้อมกัน สลับทั้งสามเส้น", (await countColor([0, 160, 0])) < 50 && (await countColor([150, 90, 30])) < 50);
// ขีดจุดสูงสุดสีแดงที่แกนล่าง
check("ขีดจุดสูงสุดสีแดงที่แกนล่าง", await q(`const cv = document.querySelector('[data-bv-plot] canvas'); const g = cv.getContext('2d'); const d = window.devicePixelRatio || 1; const y = Math.round((cv.height / d - 4) * d); const row = g.getImageData(0, y, cv.width, 1).data; for (let i = 0; i < row.length; i += 4) if (row[i] > 220 && row[i+1] < 50 && row[i+2] < 50) return true; return false;`));

// ---------- ดับเบิลคลิก ปรับสเกลตามข้อมูล ----------
await mouse("mousePressed", pl.w * 0.6, pl.h * 0.7, { button: "left", buttons: 1, clickCount: 2 }); await mouse("mouseReleased", pl.w * 0.6, pl.h * 0.7, { button: "left", buttons: 0, clickCount: 2 }); await sleep(200);
check("ดับเบิลคลิก ปรับสเกลตามข้อมูล ขึ้น (A) ป้ายไม่ทับกัน", await q(`return document.querySelector('[data-bv-axis]').innerText.includes('(A)')`) && await axisOk());
await mouse("mousePressed", pl.w * 0.6, pl.h * 0.7, { button: "left", buttons: 1, clickCount: 2 }); await mouse("mouseReleased", pl.w * 0.6, pl.h * 0.7, { button: "left", buttons: 0, clickCount: 2 }); await sleep(200);

// ---------- เมนู ----------
await q(`document.querySelector('[data-bv-menu]').click()`); await sleep(250);
const m = await q(`const p = document.querySelector('[data-bv-menupanel]'); if (!p) return null; const r = p.getBoundingClientRect(); return { items: [...p.querySelectorAll('[data-bv-item]')].map(b => b.getAttribute('data-bv-item')), bottom: r.bottom, h: innerHeight, recent: p.innerText.includes('บิตเรตแกว่ง') }`);
check("เมนูมีวิธีคิด 4 แบบ อ่านใหม่ สเกล สี เส้น", !!m && ["Second based", "GOP based", "GOP enhanced", "Frame based", "Recalculate current file", "Standard scale mode", "Use fixed colors", "Draw gradient headers"].every((x) => m.items.includes(x)), JSON.stringify(m?.items));
check("เมนูมีไฟล์ที่เปิดล่าสุด และไม่ตกขอบจอ", !!m && m.recent && m.bottom <= m.h, `ล่าง ${m?.bottom} จอ ${m?.h}`);
// ชี้แล้วเปลี่ยนสี (สกิล button-feedback · พี่กันทัก 10 พ.ย. 2569) · ชี้จริงแล้ววัดก่อนหลัง
const bgOf = (sel) => q(`const e = document.querySelector('${sel}'); const g = getComputedStyle(e); return g.backgroundColor + '|' + g.backgroundImage + '|' + g.borderColor;`);
const hoverOn = async (sel) => { const b = await c.box(sel); await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: b.left + b.w / 2, y: b.top + b.h / 2 }); await sleep(250); };
const itemSel = '[data-bv-item="GOP based"]';
const before = await bgOf(itemSel); await hoverOn(itemSel); const after = await bgOf(itemSel);
check("ชี้รายการในเมนูแล้วพื้นเปลี่ยนสี", before !== after, `${before.split("|")[0]} → ${after.split("|")[0]}`);
await c.shot(`${P}/07-เมนู.png`, "[data-bitrate]");
check("ปุ่มทุกชิ้นในหน้ามีกฎตอนชี้", (await q(`const rules = []; for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.selectorText?.includes(':hover')) rules.push(r.selectorText); } catch (e) {} } return [...document.querySelectorAll('[data-bitrate] button')].filter(b => !rules.some(s => s.split(',').some(x => { try { return b.matches(x.replace(/:hover/g, '').replace(/:not\\([^)]*\\)/g, '')); } catch (e) { return false; } }))).map(b => b.innerText.trim() || b.getAttribute('aria-label')).join(',')`)) === "");
await q(`document.querySelector('[data-bv-item="GOP based"]').click()`); await sleep(300);
check("เลือกในเมนูแล้วเปลี่ยนวิธี เมนูปิด", (await st()).badge === "GOP" && !(await q(`return !!document.querySelector('[data-bv-menupanel]')`)));
await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "s", code: "KeyS", modifiers: 2, windowsVirtualKeyCode: 83 }); await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "s", code: "KeyS", modifiers: 2, windowsVirtualKeyCode: 83 }); await sleep(300);
check("Ctrl+S กลับเป็นต่อวินาที", (await st()).badge === "SEC");

// ---------- ไฟล์ยาว ----------
// หาไฟล์ยาวด้วย node ตรง ๆ · ผ่าน PowerShell ชื่อไทยเพี้ยน
const big = readdirSync("D:/dev/tmp").filter((d) => d.startsWith("ชั้นหนังโฟลเดอร์เทส-")).flatMap((d) => readdirSync(`D:/dev/tmp/${d}`).filter((x) => x.startsWith("หนังยาว")).map((x) => `D:/dev/tmp/${d}/${x}`))[0];
if (big) {
  await q(`window.__bitrateOpen(${JSON.stringify(big)}, "v")`);
  let mid = false; const t = Date.now();
  for (;;) { await sleep(200); s = await st(); if (!mid && /อ่านแล้ว [1-9]\d?%/.test(s.sample ?? "")) { await c.shot(`${P}/08-ไฟล์ยาว-ระหว่างอ่าน.png`, "[data-bitrate]"); mid = true; } if ((s.load === "Load" && (s.stats ?? "").includes("FRAMES")) || s.err || Date.now() - t > 120000) break; }
  check("ไฟล์ยาวอ่านจบ วาดจากซ้ายไปขวาระหว่างอ่าน", mid && !s.err, `${((Date.now() - t) / 1000).toFixed(1)} วินาที · ${s.stats} ${s.err ?? ""}`);
  await c.shot(`${P}/09-ไฟล์ยาว.png`, "[data-bitrate]");
}
{
  await mouse("mouseMoved", pl.w * 0.5, pl.h * 0.5); await sleep(250);
  const b0 = await bgOf("[data-bv-load]"); await hoverOn("[data-bv-load]"); const b1 = await bgOf("[data-bv-load]");
  check("ชี้ปุ่ม Load แล้วเปลี่ยนสี", b0 !== b1);
  await c.shot(`${P}/10-ชี้ปุ่มLoad.png`, "[data-bitrate]");
}
// ---------- แทร็กเสียง (พี่กันสั่ง 10 พ.ย. 2569 "ลองให้มันปรับตามเสียงด้วย แต่การตั้งค่า การแสดงผลยังหน้าเดิมนะ แค่ถ้าจุดไหนเสียงตั้งค่าไม่ได้ ก็ปิดจางไว้") ----------
{
  const MOVIE = `${TMP}/ตัวอย่างหนัง (2026).mkv`, SONG = "D:/movie-shelf/test-media/สร้าง/เสียงซับ/เพลงทดสอบ.mp3";
  await q(`window.__bitrateOpen(${JSON.stringify(MOVIE)})`); await sleep(1500);
  const picks = await q(`return [...document.querySelectorAll('[data-bv-pick]')].map(b => b.dataset.bvPick)`);
  check("ไฟล์มีภาพกับเสียง ขึ้นรายการเลือกแทร็กกลางกราฟ", picks.join(",") === "v,a0", picks.join(","));
  await c.shot(`${P}/11-เลือกแทร็ก.png`, "[data-bitrate]");
  await q(`document.querySelector('[data-bv-pick="a0"]').click()`);
  const t = Date.now(); for (;;) { await sleep(200); s = await st(); if ((s.load === "Load" && (s.stats ?? "").includes("FRAMES")) || s.err || Date.now() - t > 60000) break; }
  check("แทร็กเสียง อ่านจบ ป้าย SEC แถวล่างบอก kHz", s.badge === "SEC" && /44\.1 kHz, 1 ch/.test(s.stats ?? ""), s.stats);
  await q(`document.querySelector('[data-bv-menu]').click()`); await sleep(250);
  const menu = await q(`return [...document.querySelectorAll('[data-bv-menupanel] [data-bv-item]')].map(b => b.dataset.bvItem + (b.getAttribute('aria-disabled') === 'true' ? '(จาง)' : ''))`);
  check("เมนูมีรายการแทร็ก วิดีโอบอกชนิดกับขนาดภาพ กับเสียง", menu.some((x) => /^วิดีโอ H\.264 \d+ × \d+/.test(x)) && menu.some((x) => x.startsWith("เสียง 1")), menu.join(" | "));
  check("เมนู GOP กับ Frame จางตอนดูเสียง ต่อวินาทียังกดได้", ["GOP based(จาง)", "GOP enhanced(จาง)", "Frame based(จาง)", "Second based"].every((x) => menu.includes(x)), menu.join(" | "));
  await c.shot(`${P}/12-เมนูตอนดูเสียง.png`, "[data-bitrate]");
  await q(`document.querySelector('[data-bv-menu]').click()`); await sleep(200);
  await q(`window.__bitrateMode('frm')`); await sleep(400);
  check("Ctrl+F ตอนดูเสียง ไม่เปลี่ยนวิธี", (await st()).badge === "SEC");
  await q(`window.__bitrateOpen(${JSON.stringify(SONG)})`);
  const t2 = Date.now(); for (;;) { await sleep(200); s = await st(); if ((s.load === "Load" && (s.stats ?? "").includes("FRAMES")) || s.err || Date.now() - t2 > 60000) break; }
  check("ไฟล์เสียงล้วน เปิดเลยไม่ถาม", !(await q(`return !!document.querySelector('[data-bv-choose]')`)) && /kHz, 2 ch/.test(s.stats ?? ""), s.stats);
  await c.shot(`${P}/13-ไฟล์เสียงล้วน.png`, "[data-bitrate]");
}
await q(`window.__bitrateView?.('new')`); // คืนเป็นแบบใหม่ ค่าตั้งต้นของโปรแกรม
await c.send("Emulation.clearDeviceMetricsOverride");
console.log(`ผ่าน ${pass} จาก ${pass + fail} ข้อ`);
c.close();
