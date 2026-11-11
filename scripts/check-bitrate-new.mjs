// ตัวตรวจหน้าบิตเรตแบบใหม่ (ลงโปรแกรม 10 พ.ย. 2569 พี่กันสั่ง "เอามอคอัปเข้าโปรแกรมเลยนะ")
// เปิดโปรแกรมโหมดพัฒนาก่อน (scripts/dev-app.ps1) · ไม่กดปุ่มเลือกไฟล์ · เปิดไฟล์ผ่าน window.__brnOpen
// ไล่ เปิดไฟล์ 4 วิธีคิด ชนิดเฟรม ปักจุด ไป I เฟรม ลากซูม แถบซูมสองแนว รีเซ็ต 5 โทน ไฟล์อ่านไม่ได้ สลับแบบเดิมแล้วไฟล์ตามไป
// ภาพลง docs/report-2026-11-10/บิตเรตแบบใหม่/
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const P = "D:/movie-shelf/docs/report-2026-11-10/บิตเรตแบบใหม่"; mkdirSync(P, { recursive: true });
const TMP = "D:/dev/tmp/ชั้นบิตเรต"; mkdirSync(TMP, { recursive: true });
const FILE = `${TMP}/ตัวอย่างหนัง (2026).mkv`;
if (!existsSync(FILE)) execFileSync("D:/movie-shelf/src-tauri/tools/ffmpeg.exe", ["-v", "error", "-y", "-f", "lavfi", "-i",
  "testsrc2=duration=150:size=960x540:rate=24,noise=alls=4:allf=t:enable='between(t,18,48)',noise=alls=9:allf=t:enable='between(t,48,66)',noise=alls=16:allf=t+u:enable='between(t,92,104)',noise=alls=6:allf=t:enable='between(t,118,150)'",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=150", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", "48", "-bf", "3", "-c:a", "aac", "-b:a", "128k", FILE]);
const BAD = `${TMP}/ไม่ใช่วิดีโอ.mkv`; writeFileSync(BAD, "not a video");
const SONG = "D:/movie-shelf/test-media/สร้าง/เสียงซับ/เพลงทดสอบ.mp3"; // ไฟล์เสียงล้วน แทร็กเดียว

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await c.send("Page.reload"); await sleep(3500);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
await q(`localStorage.setItem('brn-mode', 'sec'); localStorage.setItem('bv-mode', 'sec');`);
await q(`[...document.querySelectorAll('button,a')].find(b => b.innerText.trim() === 'บิตเรต')?.click()`); await sleep(600);
await q(`window.__bitrateView('new')`); await sleep(400);
const shot = (n) => c.shotRect(`${P}/${n}.png`, 0, 0, 1280, 800);
const st = () => q(`const t = (s) => document.querySelector(s)?.innerText.replace(/\\s+/g, ' ').trim(); return { side: t('.brn-side'), head: t('.brn-head'), chip: t('.fchip'), prog: t('[data-brnprog]'), pin: t('[data-brnpin]'), types: t('[data-brntypes]'), err: t('[data-brnerr]'), vz: t('[data-brnvz]') }`);
const waitRead = async (ms = 60000) => { await sleep(500); const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (!s.prog && /เฉลี่ย \d/.test(s.side ?? "")) return s; if (s.err) return s; await sleep(200); } return st(); };
const mode = (label) => q(`[...document.querySelectorAll('.brn-ctl .seg button')].find(b => b.innerText.trim() === ${JSON.stringify(label)})?.click()`);

check("หน้าว่าง มีจุดลากไฟล์ ปุ่มสลับแบบ", await q(`return !!document.querySelector('[data-brndrop]') && !!document.querySelector('[data-brnclassic]')`));
await shot("01-หน้าว่าง");

// ไฟล์มีทั้งภาพและเสียง ขึ้นให้เลือกแทร็กก่อน (พี่กันสั่ง 10 พ.ย. 2569)
await q(`window.__brnOpen(${JSON.stringify(FILE)})`); await sleep(1500);
const picks = await q(`return [...document.querySelectorAll('[data-brnpick]')].map(b => b.dataset.brnpick + '=' + b.innerText.replace(/\\s+/g, ' ').trim())`);
check("ไฟล์มีภาพกับเสียง ขึ้นหน้าเลือกแทร็ก วิดีโอกับเสียง", !!(await q(`return !!document.querySelector('[data-brnchoose]')`)) && picks.length === 2 && /^v=/.test(picks[0]) && /^a0=เสียง 1/.test(picks[1]), picks);
await c.shotRect(`${P}/22-เลือกแทร็กก่อน.png`, 0, 0, 1280, 800);
await q(`document.querySelector('[data-brnpick="v"]').click()`);
let s = await waitRead();
check("ต่อวินาที อ่านจบ ค่าเฉลี่ยราว 2.6 Mbps", /เฉลี่ย 2\.6\d Mbps/.test(s.side ?? ""), s.side?.slice(0, 80));
check("การ์ดชื่อไฟล์บอก codec ขนาด fps", /H\.264, 960 × 540, 24 fps/.test(s.chip ?? ""), s.chip);
const pl = await c.box("[data-brnplot]");
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pl.left + pl.w * 0.36, y: pl.top + pl.h * 0.45 }); await sleep(250);
check("ชี้กราฟขึ้นกล่องบอกค่า", await q(`return /Mbps|kbps/.test(document.querySelector('[data-brntip]')?.innerText ?? '')`));
await shot("03-ต่อวินาที-ชี้ดูค่า");

for (const m of ["ต่อ GOP", "GOP แบบถ่วง"]) { await mode(m); s = await waitRead(); check(`${m} สลับได้ ไม่ต้องอ่านใหม่`, /เฉลี่ย 2\.6\d Mbps/.test(s.side ?? "") && !s.prog); }
await mode("ต่อเฟรม"); await sleep(400);
s = await waitRead(90000);
check("ต่อเฟรม นับ I P B", /I\s*\d+\s+P\s*[\d,]+\s+B\s*[\d,]+/.test(s.types ?? ""), s.types);
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pl.left + pl.w * 0.5, y: pl.top + pl.h * 0.5, button: "left", buttons: 1, clickCount: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pl.left + pl.w * 0.5, y: pl.top + pl.h * 0.5, button: "left", buttons: 0, clickCount: 1 }); await sleep(250);
check("คลิกปักจุด แถบล่างบอกค่า", /ปักไว้ที่/.test((await st()).pin ?? ""));
await q(`document.querySelector('[data-brnnexti]')?.click()`); await sleep(250);
check("ไป I เฟรมถัดไป", /I เฟรม \(ภาพเต็ม\)/.test((await st()).pin ?? ""), (await st()).pin);
await shot("05-ต่อเฟรม-ปักจุด");

// ลากซูมในกราฟ
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pl.left + pl.w * 0.28, y: pl.top + pl.h * 0.5, button: "left", buttons: 1, clickCount: 1 });
for (let i = 1; i <= 8; i++) await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pl.left + pl.w * (0.28 + i * 0.025), y: pl.top + pl.h * 0.5, buttons: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pl.left + pl.w * 0.48, y: pl.top + pl.h * 0.5, button: "left", buttons: 0, clickCount: 1 }); await sleep(300);
check("ลากในกราฟแล้วซูม", !/0:00 ถึง 2:30/.test((await st()).head ?? ""), (await st()).head);
await q(`document.querySelector('[data-brnzoomreset]').click()`); await sleep(200);
check("รีเซ็ตกลับทั้งไฟล์", /0:00 ถึง 2:30/.test((await st()).head ?? ""));

// แถบซูมแนวนอนกับแนวตั้ง
await mode("ต่อวินาที"); await sleep(300);
const hb = await c.box("[data-brnhzoom] .track");
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: hb.left + hb.w * 0.6, y: hb.top + hb.h / 2, button: "left", buttons: 1, clickCount: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: hb.left + hb.w * 0.6, y: hb.top + hb.h / 2, button: "left", buttons: 0, clickCount: 1 }); await sleep(250);
check("แถบซูมแนวนอน กดแล้วช่วงที่เห็นสั้นลง", !/0:00 ถึง 2:30/.test((await st()).head ?? ""), (await st()).head);
const vb = await c.box("[data-brnvzoom] .track");
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: vb.left + vb.w / 2, y: vb.top + vb.h * 0.5, button: "left", buttons: 1, clickCount: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: vb.left + vb.w / 2, y: vb.top + vb.h * 0.5, button: "left", buttons: 0, clickCount: 1 }); await sleep(250);
check("แถบซูมแนวตั้ง ขยายมากกว่า 1 เท่า", (await st()).vz !== "1×", (await st()).vz);
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 }); await sleep(200);
await shot("11-แถบซูมสองแนว");
await q(`document.querySelector('[data-brnzoomreset]').click()`); await sleep(200);
s = await st();
check("รีเซ็ตกลับทั้งไฟล์และ 1 เท่า ปุ่มรีเซ็ตจาง", /0:00 ถึง 2:30/.test(s.head ?? "") && s.vz === "1×" && await q(`return document.querySelector('[data-brnzoomreset]').disabled`));

// 5 โทน ไม่มีอะไรล้น กราฟวาด
for (const [id, name] of [["quartz", "โรสควอตซ์"], ["wine", "ไวน์กับทอง"], ["night", "กุหลาบกลางคืน"], ["sage", "บลัชกับเสจ"], ["mauve", "มอฟหรู"]]) {
  await q(`window.__applyTone(${JSON.stringify(id)})`); await sleep(500);
  const ok = await q(`const over = [...document.querySelectorAll('[data-brn] *')].some(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > innerWidth + 1 || r.bottom > innerHeight + 1); }); const cv = document.querySelector('[data-brnplot] canvas'); const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 400) if (d[i]) n++; return !over && n > 50;`);
  check(`โทน${name} ไม่มีอะไรล้น กราฟวาดแล้ว`, ok);
  await shot(`08-โทน-${name}`);
}
await q(`window.__applyTone('quartz')`);

// สลับไปแบบเดิม ไฟล์ตามไป แล้วกลับ
await q(`document.querySelector('.brn-ctl [data-brnclassic]').click()`); await sleep(2500);
check("สลับแบบเดิม ไฟล์ตามไป", /ตัวอย่างหนัง \(2026\)\.mkv/.test(await q(`return document.querySelector('[data-bv-title]')?.innerText ?? ''`)));
await shot("09-แบบเดิม");
await q(`document.querySelector('[data-bvmodern]').click()`); await sleep(1500);
check("กลับแบบชั้นหนัง ไฟล์ตามมา", /ตัวอย่างหนัง/.test((await st()).chip ?? ""));

// แทร็กเสียงของไฟล์หนัง · แผงซ้ายเป็นข้อมูลเสียง วิธีคิดต่อวินาทีอย่างเดียว · สลับกลับวิดีโอได้จากปุ่มแทร็ก
await q(`window.__brnOpen(${JSON.stringify(FILE)}, "a0")`);
s = await waitRead();
check("แทร็กเสียง หัวกราฟ Audio Bitrate", /Audio Bitrate ต่อวินาที/.test(s.head ?? ""), s.head);
check("แผงซ้ายเป็นข้อมูลเสียง มี Channels Sample rate", /ข้อมูลเสียง/.test(s.side ?? "") && /Channels/.test(s.side ?? "") && /Sample rate \d/.test(s.side ?? "") && !/ขนาดภาพ/.test(s.side ?? ""), s.side?.slice(-200));
check("แทร็กเสียงไม่มีแถว I P B บอกเหตุแทน", /ไม่มีคีย์เฟรมกับชนิดเฟรม/.test(s.types ?? ""), s.types);
check("วิธีคิดกดไม่ได้ตอนดูเสียง", await q(`return !!document.querySelector('.brn-ctl .seg.seg-off')`));
check("ปุ่มแทร็กอยู่แถบบน เลือกได้สองแทร็ก", await q(`return !!document.querySelector('[data-brntrack]')`));
await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
await c.shotRect(`${P}/23-แทร็กเสียงของหนัง.png`, 0, 0, 1280, 800);
await q(`document.querySelector('[data-brntrack] button').click()`); await sleep(300);
await c.shotRect(`${P}/24-ปุ่มแทร็ก.png`, 0, 0, 1280, 800);
await q(`[...document.querySelectorAll('[role=option]')].find(e => e.innerText.trim() === 'วิดีโอ')?.click()`);
s = await waitRead();
check("เลือกวิดีโอจากปุ่มแทร็ก กลับเป็น Video Bitrate", /Video Bitrate/.test(s.head ?? ""), s.head);
// ไฟล์เสียงล้วน แทร็กเดียว เปิดเลยไม่ถาม
await q(`window.__brnOpen(${JSON.stringify(SONG)})`);
s = await waitRead();
check("ไฟล์เสียงล้วน เปิดเลยไม่ถาม เป็น Audio Bitrate", !(await q(`return !!document.querySelector('[data-brnchoose]')`)) && /Audio Bitrate/.test(s.head ?? ""), s.head);
check("ไฟล์เสียงล้วน ไม่มีปุ่มแทร็ก", !(await q(`return !!document.querySelector('[data-brntrack]')`)));
await c.shotRect(`${P}/25-ไฟล์เสียงล้วน.png`, 0, 0, 1280, 800);

// ไฟล์อ่านไม่ได้
await q(`window.__brnOpen(${JSON.stringify(BAD)})`); await sleep(2500);
s = await st();
check("ไฟล์อ่านไม่ได้ บอกเหตุ ไม่วาดกราฟเปล่า", /อ่านไฟล์นี้ไม่ได้/.test(s.err ?? ""), s.err);
await shot("10-อ่านไม่ได้");

await q(`localStorage.setItem('brn-mode', 'sec')`);
// เอาไฟล์ทดสอบออกจากรายการเปิดล่าสุดของพี่กัน
await q(`localStorage.setItem("bv-recent", JSON.stringify(JSON.parse(localStorage.getItem("bv-recent") || "[]").filter((p) => !/ไม่ใช่วิดีโอ/.test(p))))`);
await c.send("Emulation.clearDeviceMetricsOverride");
console.log(`ผ่าน ${pass} จาก ${pass + fail} ข้อ`);
c.close();
