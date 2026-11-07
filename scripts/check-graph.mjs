// เทสหน้ากราฟเสียง ในหน้าต่างโปรแกรมจริง (มอคอัป docs/mockups/audio-graph.html · พี่กันสั่ง "ลงมือทำเลย" 7 พ.ย. 2569)
// ใช้: node scripts/check-graph.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1)
//      node scripts/check-graph.mjs --built  (ตัวที่สร้างจริง scripts/dev-app.ps1 -Built) เช็กเพิ่มว่าไม่มีอะไรโดนกติกาความปลอดภัย (CSP) ตัวจริงกัน
// ไฟล์เสียงทดสอบสร้างด้วย ffmpeg ทุกรอบ ไม่ขึ้น git · ไฟล์จริงจากพี่กันค่อยเทสเพิ่มเมื่อได้มา
// ผ่านเมื่อ ทั้ง 6 แบบวาดจากข้อมูลจริง · 7.1 5.1 2.0 ช่องเดียว แถบครบทุกช่อง · ซ่อนช่องได้ · ชี้แล้วอ่านค่าได้ · ทางเข้า 3 ทาง
//          ไฟล์เสียงอย่างเดียวเปิดได้ · FLAC ปลอมขึ้นเตือน · เสียงฮัม 50 Hz ขึ้นเตือน · ไม่มีแทร็กเสียงขึ้นข้อความ · หยุดแล้วอ่านใหม่ได้
import { mkdirSync, rmSync, readdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";

const SRC = join("test-media", "สร้าง", "หนัง");
const TMP = "D:\\dev\\tmp";
for (const d of readdirSync(TMP)) if (d.startsWith("ชั้นกราฟเสียง") || d.startsWith("ไฟล์เสียงกราฟ")) rmSync(join(TMP, d), { recursive: true, force: true });
const stamp = Date.now();
const DIR = join(TMP, `ชั้นกราฟเสียง-${stamp}`);
const AUD = join(TMP, `ไฟล์เสียงกราฟ-${stamp}`);
const BUILT = process.argv.includes("--built");
const OUT = BUILT ? "docs/report-2026-11-07/กราฟเสียง-ตัวจริง" : "docs/report-2026-11-07/กราฟเสียง-ในโปรแกรม";
const FF = resolve("src-tauri", "tools", "ffmpeg.exe");
mkdirSync(OUT, { recursive: true });
mkdirSync(DIR, { recursive: true });
mkdirSync(AUD, { recursive: true });
for (const f of ["ดาวเหนือ (2023).mkv", "เสียกลางเรื่อง (2022).mkv"]) copyFileSync(join(SRC, f), join(DIR, f));

/* ---------- ไฟล์เสียงทดสอบ ---------- */
const A = (n) => join(AUD, n);
const ff = (args) => execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args]);
console.log("สร้างไฟล์เสียงทดสอบ");
// 7.1 แต่ละช่องคนละความถี่ ดังไม่เท่ากัน · ลำดับช่อง FL FR FC LFE BL BR SL SR
ff(["-f", "lavfi", "-i", "aevalsrc=0.5*sin(2*PI*220*t)|0.5*sin(2*PI*330*t)|0.4*sin(2*PI*440*t)|0.6*sin(2*PI*55*t)|0.12*sin(2*PI*660*t)|0.12*sin(2*PI*770*t)|0.3*sin(2*PI*880*t)*(0.5+0.5*sin(2*PI*0.25*t))|0.3*sin(2*PI*990*t):c=7.1:s=48000:d=20", "-c:a", "flac", A("ทดสอบลำโพง 7.1.flac")]);
// FLAC 96 kHz 24 บิต เสียงถึงเกือบ 48 kHz
ff(["-f", "lavfi", "-i", "anoisesrc=color=pink:sample_rate=96000:amplitude=0.25:duration=12", "-ac", "2", "-sample_fmt", "s32", "-c:a", "flac", A("เพลง 96k 24-bit.flac")]);
// FLAC ที่แปลงมาจาก MP3 128k · ตัวเข้ารหัส MP3 ตัดความถี่สูงทิ้ง
ff(["-f", "lavfi", "-i", "anoisesrc=color=pink:sample_rate=44100:amplitude=0.25:duration=12", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k", A("_ต้นทาง.mp3")]);
ff(["-i", A("_ต้นทาง.mp3"), "-c:a", "flac", A("FLAC แปลงจาก MP3.flac")]);
rmSync(A("_ต้นทาง.mp3"));
// อัดใกล้ปลั๊ก เสียงฮัม 50 Hz กับเลขคูณ 100 150
ff(["-f", "lavfi", "-i", "aevalsrc=0.05*sin(2*PI*50*t)+0.025*sin(2*PI*100*t)+0.015*sin(2*PI*150*t)+0.004*(random(0)*2-1):s=48000:d=15", "-c:a", "pcm_s16le", A("อัดใกล้ปลั๊ก มีเสียงฮัม.wav")]);
// MP3 เสียงเดียว
ff(["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=10", "-af", "volume=0.5,tremolo=f=2:d=0.7", "-c:a", "libmp3lame", "-b:a", "96k", A("เสียงเดียว.mp3")]);
// วิดีโอไม่มีแทร็กเสียง (แบบวิดีโออัดหน้าจอบางแบบ)
ff(["-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25:duration=3", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", A("อัดหน้าจอไม่มีเสียง.mp4")]);
// 5.1 AC-3 ยาว 20 นาที ไว้เทสปุ่มหยุดกับจับเวลาอ่านทั้งเรื่อง
ff(["-f", "lavfi", "-i", "anoisesrc=color=pink:sample_rate=48000:amplitude=0.2:duration=1200", "-ac", "6", "-c:a", "ac3", "-b:a", "448k", A("ยาว 20 นาที 5.1.ac3")]);

/* ---------- ตัวช่วย ---------- */
const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const text = (sel) => q(`return document.querySelector(${JSON.stringify(sel)})?.innerText.replace(/\\s+/g, ' ') ?? ''`);
const count = (sel) => q(`return document.querySelectorAll(${JSON.stringify(sel)}).length`);
const shot = async (f, sel) => { await c.evaluate("document.querySelectorAll('.toast .x').forEach(b => b.click())"); await c.move(500, 12); await sleep(300); return c.shot(`${OUT}/${f}`, sel, 0); };
/** ถ่ายภาพโดยไม่เลื่อนเมาส์ออก ใช้กับภาพที่ต้องเห็นเส้นชี้ตรงที่ชี้อยู่ */
const shotHere = async (f, sel) => { await c.evaluate("document.querySelectorAll('.toast .x').forEach(b => b.click())"); await sleep(300); return c.shot(`${OUT}/${f}`, sel, 0); };
const waitFor = async (js, ms = 30000) => { for (let t = 0; t < ms; t += 150) { if (await q(js)) return true; await sleep(150); } return false; };
const clickText = (sel, t) => c.evaluate(`[...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.innerText.includes(${JSON.stringify(t)}))?.click()`);
const closeToasts = () => c.evaluate("document.querySelectorAll('.toast .x').forEach(b => b.click())");
const plotReady = () => waitFor("return !!document.querySelector('[data-plot]') && !document.querySelector('[data-graphloading]')", 120000);
const view = async (v) => { await c.click(`[data-view="${v}"]`); await sleep(400); };
/** สัดส่วนจุดภาพที่ไม่ใช่สีพื้น (เทียบจุดมุมซ้ายบน) · 0 = ว่างเปล่า */
const inked = (sel) => q(`const cv = document.querySelector(${JSON.stringify(sel)}); if (!cv || !cv.width) return -1;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0, m = 0;
  for (let i = 0; i < d.length; i += 4 * 7) { m++; if (Math.abs(d[i] - d[0]) + Math.abs(d[i + 1] - d[1]) + Math.abs(d[i + 2] - d[2]) > 30) n++; }
  return Math.round(n / m * 1000) / 1000;`);
/** ลากไฟล์มาวาง · ส่งเหตุการณ์เดียวกับที่ Windows ส่งตอนปล่อยไฟล์ลงหน้าต่าง */
const drop = (p) => c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: [${JSON.stringify(p)}], position: { x: 700, y: 400 } } })`);
const openDrop = async (p, name) => { await drop(p); return waitFor(`return (document.querySelector('.fchip .nm')?.innerText ?? '').startsWith(${JSON.stringify(name)})`, 10000); };
const hoverMid = async (sel, fx = 0.5, fy = 0.5) => { const b = await c.box(sel); await c.move(b.left + b.w * fx, b.top + b.h * fy); await sleep(300); };

/* ---------- เตรียม ---------- */
await inv("set_settings", { patch: { folders: [DIR], playerPath: "", recheckReminderDays: 30, defaultCheck: "quick", quickCheckOnStart: false } });
if (BUILT) {
  await c.send("Page.enable");
  await c.send("Page.addScriptToEvaluateOnNewDocument", {
    source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ dir: e.violatedDirective, uri: e.blockedURI, sample: e.sample }));",
  });
}
await c.evaluate("localStorage.removeItem('graph-prefs'); location.hash = ''; location.reload()"); await sleep(2500);
if (BUILT) {
  const origin = await q("return location.origin");
  check("ตัวโปรแกรมที่สร้างจริง หน้าโหลดจากตัวโปรแกรม ไม่ใช่ dev server", origin === "http://tauri.localhost", origin);
}
await waitFor("return document.querySelectorAll('.book').length >= 2", 60000);
// ตรวจละเอียดเรื่องที่ทำเสียไว้ ให้มีผลตรวจที่เสียทั้งภาพและเสียงไว้เทสปุ่มดูกราฟเสียงช่วงนี้ กับแถบแดงบนกราฟ
const lib0 = await inv("get_library");
const broken = lib0.movies.find((m) => m.name === "เสียกลางเรื่อง (2022)");
await inv("check_start", { ids: [broken.id], mode: "full" });
for (let t = 0; t < 120; t++) { const l = await inv("get_library"); if (l.movies.find((m) => m.id === broken.id)?.check?.mode === "full") break; await sleep(500); }
await sleep(500);

/* ---------- 1 เมนูซ้าย และหน้าตอนยังไม่เลือกไฟล์ ---------- */
const navs = await q("return [...document.querySelectorAll('button.nav:not(.navtoggle) .navtxt')].map(b => b.innerText.trim())");
check("เมนูซ้ายมี กราฟเสียง ต่อจาก ตรวจไฟล์", navs.indexOf("กราฟเสียง") === navs.indexOf("ตรวจไฟล์") + 1, navs.join(" · "));
await clickText("button.nav", "กราฟเสียง");
await waitFor("return !!document.querySelector('[data-graphdrop]')", 5000);
const picks = await q("return [...document.querySelectorAll('[data-graphpick]')].map(b => b.dataset.graphpick)");
check("ยังไม่เลือกไฟล์ ขึ้นช่องลากไฟล์มาวาง ปุ่มเลือกไฟล์ และรายชื่อเรื่องบนชั้นให้กดเลือก", (await text("[data-graphdrop]")).includes("ลากไฟล์หนังหรือไฟล์เสียงมาวาง") && picks.includes("ดาวเหนือ (2023)"), picks.join(" · "));
await shot("01-ยังไม่เลือกไฟล์.png");

/* ---------- 2 หนังบนชั้น สองแทร็ก ---------- */
const t0 = Date.now();
await c.click('[data-graphpick="ดาวเหนือ (2023)"]');
const sawLoading = await waitFor("return !!document.querySelector('[data-graphloading]') || !!document.querySelector('[data-plot]')", 5000);
if (await count("[data-graphloading]")) await shot("02-กำลังอ่านเสียง.png");
await plotReady();
check("เลือกเรื่องจากชั้น ขึ้นโครงจางระหว่างอ่าน แล้ววาดกราฟ", sawLoading && (await count("[data-lane]")) >= 1, `${Date.now() - t0} ms`);
const info2 = await text("[data-graphinfo]");
check("การ์ดข้อมูลเสียงเป็นภาษาอังกฤษ (channel kHz) · แทร็กแรกของเรื่องนี้เสียงเดียว", /1 channel\b/.test(info2) && /kHz/.test(info2), info2);
// เลือกแทร็ก 5.1
await c.click("[data-graphtrack] button"); await sleep(200);
const trackOpts = await q("return [...document.querySelectorAll('[role=option]')].map(o => o.innerText.trim())");
await clickText("[role=option]", "5.1");
await waitFor("return document.querySelectorAll('[data-lane]').length === 6 && !document.querySelector('[data-graphloading]')", 60000);
const lanes51 = await q("return [...document.querySelectorAll('[data-lane]')].map(l => l.dataset.lane)");
check("ดรอปดาวน์แทร็กเสียง เลือกแทร็ก 5.1 แล้วขึ้นแถบ 6 ช่อง ตามลำดับ FL FR FC LFE SL SR", lanes51.join(" ") === "FL FR FC LFE SL SR", `${trackOpts.join(" / ")} → ${lanes51.join(" ")}`);
// ไฟล์ทดสอบนี้ แทร็ก 5.1 มีเสียงโทนแค่ช่องกลาง ช่องอื่นเงียบทั้งเรื่อง
const ink = await inked("[data-lane='FC'] canvas"), inkFL = await inked("[data-lane='FL'] canvas");
const labFL = await text("[data-lane='FL'] .lab");
check("แถบรูปคลื่นวาดจากเสียงจริง ช่องกลางมีเส้น ช่องที่เงียบทั้งเรื่องว่างและบอกว่าเงียบ", ink > 0.01 && inkFL < 0.03 && labFL.includes("เงียบทั้งเรื่อง"), `ช่องกลาง ${ink} · ซ้ายหน้า ${inkFL} · ${labFL}`);
await shot("03-รูปคลื่น-5.1.png");

await c.click('[data-style="bars"]'); await sleep(300);
check("ปุ่มแบบแท่ง เปลี่ยนเป็นแท่ง", (await q("return document.querySelector('[data-style=bars]').classList.contains('on')")) && (await inked("[data-lane='FL'] canvas")) > 0.02);
await shot("04-รูปคลื่นแบบแท่ง.png");
await c.click('[data-style="fine"]'); await sleep(200);

/* ---------- 3 ซูม ชี้อ่านค่า ซ่อนช่อง ---------- */
await c.click('[data-zoom="30"]');
await sleep(1500);
const head30 = await text(".plothead");
const tipBefore = await text(".tip .t");
await hoverMid("[data-lanes]", 0.8, 0.4);
const tipRows = await count(".tip .r b"), tipAt = await text(".tip .t");
check("ซูม 30 วินาที แล้วชี้บนกราฟ เส้นชี้ย้ายตามเมาส์ ขึ้นกล่องค่าทุกช่องที่เวลานั้น 6 แถว", tipRows === 6 && /ถึง/.test(head30) && tipAt !== tipBefore, `${head30} · ก่อนชี้ ${tipBefore} ชี้แล้ว ${tipAt} · ${tipRows} แถว`);
await shotHere("05-ซูมแล้วชี้อ่านค่า.png");
await c.move(500, 12);
await c.click('.spk .s[aria-label="ซ่อนช่อง LFE"]'); await sleep(300);
const hid = await text(".apanel .card h3");
check("กดลำโพง LFE ในแผนผัง ซ่อนช่องนั้น เหลือ 5 แถบ", (await count("[data-lane]")) === 5 && hid.includes("แสดง 5 จาก 6 ช่อง"), hid);
await shot("06-ซ่อนช่องเบส.png");
await c.click('.spk .s[aria-label="แสดงช่อง LFE"]'); await sleep(200);

/* ---------- 4 ความถี่ ---------- */
await view("spec"); await sleep(1500);
const specInk = await inked("[data-lane='FC'] canvas");
check("แบบความถี่ วาดทุกช่อง สีตามชุด", (await count("[data-lane]")) === 6 && specInk > 0.05, `ช่องกลาง ${specInk}`);
await shot("07-ความถี่-สีตามชุด.png");
await c.click('[data-cmap="rainbow"]'); await sleep(400);
await shot("08-ความถี่-สีรุ้ง.png");
await c.click('[data-cmap="theme"]');
await c.click('[data-zoom="all"]'); await sleep(300);

/* ---------- 5 ความดัง ---------- */
await view("loud");
const tiles = await text("[data-graphtiles]");
check("แบบความดัง การ์ดความดังรวมเป็นตัวเลข LUFS จาก EBU R128", /−?\d+\.\d LUFS/.test(tiles) && /dBTP/.test(tiles), tiles);
const loudTip = await (async () => { await hoverMid("[data-loudbox]", 0.5, 0.5); return text(".tip"); })();
check("เส้นความดังต่อเนื่อง ชี้กลางเรื่องได้ค่าราว −22 LUFS ไม่ตกลง −70", /−2\d\.\d LUFS/.test(loudTip), loudTip);
await shot("09-ความดัง.png");
await c.click("[data-table]"); await sleep(200);
check("ดูเป็นตาราง ขึ้นตารางยอดเสียงทุกช่อง 6 แถว", (await count("[data-graphtable] tbody tr")) === 6);
await shot("09ข-ความดัง-ตาราง.png", "[data-graphtable]");
await c.click("[data-table]");

/* ---------- 6 ซ้อนเทียบ ---------- */
await view("cmp");
const cmpLg = await text(".agfoot .lg");
await hoverMid("[data-cmpbox]", 0.5, 0.5);
check("แบบซ้อนเทียบ เส้นซ้าย ขวา กลาง 3 เส้น ชี้แล้วขึ้นค่า 3 แถว", /FL/.test(cmpLg) && /FR/.test(cmpLg) && /FC/.test(cmpLg) && (await count(".tip .r b")) === 3, cmpLg);
await shot("10-ซ้อนเทียบ.png");
await c.move(500, 12);

/* ---------- 7 วิเคราะห์ ---------- */
await view("spek"); await sleep(600);
const spekInk = await inked("[data-spek]");
const vTone = await text("[data-spekverdict]");
check("แบบวิเคราะห์ วาดความถี่พื้นดำ · ไฟล์เสียงโทนล้วน บอกว่าแทบไม่มีเสียงสูง ดูไม่ได้ว่าแปลงมาไหม ไม่หาว่าไฟล์ปลอม", spekInk > 0.02 && vTone.includes("แทบไม่มีเสียงสูง"), `จุดที่มีสี ${spekInk} · ${vTone}`);
await shot("11-วิเคราะห์-ความร้อน.png");

/* ---------- 8 ความถี่เฉลี่ย ---------- */
await view("psd");
await waitFor("return !!document.querySelector('[data-psdverdict]')", 30000);
await hoverMid("[data-psdbox]", 0.35, 0.5);
const psdTip = await text(".tip");
check("แบบความถี่เฉลี่ย คิดจากช่วงที่เลือก ชี้แล้วบอกความถี่ โน้ต และยอดใกล้สุด", psdTip.includes("โน้ต") && /Hz/.test(psdTip), psdTip);
await shot("12-ความถี่เฉลี่ย.png");
await c.move(500, 12);

/* ---------- 9 ชุดสี ---------- */
await view("wave");
await c.click('[data-theme="ฟ้า"]'); await sleep(300);
const pref = await q("return JSON.parse(localStorage.getItem('graph-prefs') ?? '{}')");
check("เปลี่ยนชุดสีเป็นฟ้า จำค่าไว้ เปิดครั้งหน้ายังเป็นฟ้า", pref.theme === "ฟ้า" && (await text(".swname")) === "ฟ้า", JSON.stringify(pref));
await shot("13-ชุดสีฟ้า.png");
await c.click('[data-theme="ชมพู"]'); await sleep(200);

/* ---------- 10 ทางเข้าจากหน้าต่างผลตรวจ ---------- */
await clickText("button.nav", "ตรวจไฟล์");
await waitFor("return !!document.querySelector('[data-ckrow=\"เสียกลางเรื่อง (2022)\"]')", 5000);
await c.click('[data-ckrow="เสียกลางเรื่อง (2022)"] .ckname'); await sleep(400);
const realSpans = await text("[data-ckspans]");
check("ผลตรวจจริงที่เสียแค่ภาพ ไม่มีปุ่มดูกราฟเสียงช่วงนี้ (มอคอัป ปุ่มนี้มีเฉพาะจุดเสียที่เป็นเสียง)", !(await count("[data-ckgraph]")) && !/เสียง/.test(realSpans.replace("เสียอะไร", "")), realSpans);
await c.evaluate("[...document.querySelectorAll('.dlg .btn')].find(b => b.innerText === 'ปิด')?.click()"); await sleep(200);
// ผลตรวจที่มีจุดเสียเป็นเสียง ตั้งด้วยคำสั่งเทส (ตัวตรวจจริงจับไฟล์ทดสอบนี้ได้แค่ภาพแตก)
await inv("dev_set_check", { path: broken.path, status: "bad", sha256: null, checkAt: Math.floor(Date.now() / 1000), spans: [{ from: 30, to: 31, what: "ภาพแตกเป็นสี่เหลี่ยมและเสียงเงียบหายไป 1 วินาที" }] });
await sleep(400);
await c.click('[data-ckrow="เสียกลางเรื่อง (2022)"] .ckname'); await sleep(400);
const hasCkGraph = await count("[data-ckgraph]");
await shot("14-หน้าต่างผลตรวจ-ปุ่มดูกราฟเสียง.png", ".dlg");
await c.click("[data-ckgraph]");
await plotReady(); await sleep(1500);
const headCk = await text(".plothead");
const marks = await text("[data-mark]");
check("หน้าต่างผลตรวจ ปุ่มดูกราฟเสียงช่วงนี้ พาไปหน้ากราฟ ซูม 30 วินาทีรอบจุดเสีย และมีแถบแดงผลตรวจ", hasCkGraph === 1 && headCk.includes("0:15 ถึง 0:45") && marks.includes("ผลตรวจ"), `${headCk} · ${marks}`);
await shot("15-กราฟจากผลตรวจ-แถบแดง.png");

/* ---------- 11 ทางเข้าจากแผงขวาของชั้นวาง ---------- */
await clickText("button.nav", "ชั้นวางหนัง"); await sleep(500);
await c.click('.book[data-movie="ดาวเหนือ (2023)"]'); await sleep(300);
// แผงขวายาวกว่าจอ ปุ่มที่ 7 อยู่ล่างสุด เลื่อนแผงลงก่อนถ่ายกลุ่มปุ่ม
await c.evaluate("document.querySelector('[data-shelfgraph]').scrollIntoView({ block: 'end' })"); await sleep(200);
await shot("16-แผงขวา-ปุ่มกราฟเสียง.png", ".detail .actions");
await c.click("[data-shelfgraph]");
await plotReady();
check("แผงขวาของชั้นวาง ปุ่มกราฟเสียงเต็มแถว พาไปหน้ากราฟของเรื่องนั้น", (await text(".fchip .nm")).startsWith("ดาวเหนือ (2023)"), await text(".fchip .nm"));

/* ---------- 12 ไฟล์เสียงอย่างเดียว ลากมาวาง ---------- */
const d71 = await openDrop(A("ทดสอบลำโพง 7.1.flac"), "ทดสอบลำโพง 7.1");
await plotReady();
const lanes71 = await q("return [...document.querySelectorAll('[data-lane]')].map(l => l.dataset.lane).join(' ')");
const meta71 = await text(".fchip .meta");
check("ลากไฟล์เสียง 7.1 มาวาง เปิดได้ แถบ 8 ช่อง แผนผังลำโพง 8 ตัว บอกว่าเป็นไฟล์เสียง", d71 && lanes71 === "FL FR FC LFE BL BR SL SR" && (await count(".spk .s")) === 8 && meta71.includes("ไฟล์เสียง"), `${lanes71} · ${meta71}`);
await shot("17-ไฟล์เสียง-7.1.png");

await openDrop(A("เพลง 96k 24-bit.flac"), "เพลง 96k 24-bit"); await plotReady();
const info96 = await text("[data-graphinfo]");
await view("spek"); await sleep(500);
const v96 = await text("[data-spekverdict]");
check("FLAC 96 kHz 24 บิต การ์ดบอก 96 kHz 24-bit · วิเคราะห์ไม่ขึ้นเตือนไฟล์ปลอม", info96.includes("96 kHz") && info96.includes("24-bit") && !v96.includes("แปลงมาจาก"), `${info96} · ${v96}`);
await shot("18-FLAC-96k-ของจริง.png");

await openDrop(A("FLAC แปลงจาก MP3.flac"), "FLAC แปลงจาก MP3"); await plotReady(); await sleep(500);
const vFake = await text("[data-spekverdict]");
check("FLAC ที่แปลงมาจาก MP3 ขึ้นเตือนว่าน่าจะแปลงมา คุณภาพไม่ได้ดีกว่าต้นทาง", vFake.includes("แปลงมาจาก MP3 หรือ AAC"), vFake);
await shot("19-FLAC-ปลอม.png");

await openDrop(A("อัดใกล้ปลั๊ก มีเสียงฮัม.wav"), "อัดใกล้ปลั๊ก"); await plotReady();
await view("psd");
await waitFor("return !!document.querySelector('[data-psdverdict]')", 30000);
const vHum = await text("[data-psdverdict]");
check("เสียงอัดใกล้ปลั๊ก ความถี่เฉลี่ยขึ้นเตือนเสียงฮัมจากไฟบ้าน ยอดแคบที่ 50 100 150 Hz", vHum.includes("เสียงฮัม") && vHum.includes("ยอดแคบที่ 50 100 150 Hz"), vHum);
await shot("20-เสียงฮัม-50Hz.png");

await view("wave");
await openDrop(A("เสียงเดียว.mp3"), "เสียงเดียว"); await plotReady();
const lanesMono = await q("return [...document.querySelectorAll('[data-lane]')].map(l => l.dataset.lane).join(' ')");
const cmpOff = await q("return document.querySelector('[data-view=cmp]').disabled");
check("MP3 เสียงเดียว แถบเดียวชื่อ M · ปุ่มซ้อนเทียบกดไม่ได้", lanesMono === "M" && cmpOff, `${lanesMono} · ซ้อนเทียบกดไม่ได้ ${cmpOff}`);
await shot("21-เสียงเดียว.png");

await openDrop(A("อัดหน้าจอไม่มีเสียง.mp4"), "อัดหน้าจอไม่มีเสียง");
await waitFor("return !!document.querySelector('[data-grapherror]')", 10000);
const noAudio = await text("[data-grapherror]");
check("วิดีโอไม่มีแทร็กเสียง ขึ้นข้อความบอก ไม่มีปุ่มอ่านใหม่", noAudio.includes("ไม่มีแทร็กเสียง") && !(await count("[data-graphretry]")), noAudio);
await shot("22-ไม่มีแทร็กเสียง.png");

/* ---------- 12ข เพลงจริงจากพี่กัน FLAC 96 kHz 24 บิต (ได้มา 7 พ.ย. 2569 · ไม่ขึ้น git · สำเนาตั้งชื่อกลาง ๆ) ---------- */
const SONG = join("test-media", "จากพี่กัน", "12 CRYst-Alise.flac");
if (existsSync(SONG)) {
  copyFileSync(SONG, A("เพลงจริง 96k 24-bit.flac"));
  // พี่กันให้แปลงเองได้ · ตัด ปกเพลง ออก (-map 0:a) · MP3 กับ AAC ใช้ 48 kHz
  ff(["-i", A("เพลงจริง 96k 24-bit.flac"), "-map", "0:a", "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "320k", A("เพลงจริง MP3 320k.mp3")]);
  ff(["-i", A("เพลงจริง 96k 24-bit.flac"), "-map", "0:a", "-ar", "48000", "-c:a", "aac", "-b:a", "256k", A("เพลงจริง AAC 256k.m4a")]);
  ff(["-i", A("เพลงจริง 96k 24-bit.flac"), "-map", "0:a", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", A("_เพลง 128k.mp3")]);
  ff(["-i", A("_เพลง 128k.mp3"), "-c:a", "flac", A("เพลงจริง FLAC แปลงจาก MP3.flac")]);
  rmSync(A("_เพลง 128k.mp3"));

  const tSong = Date.now();
  await openDrop(A("เพลงจริง 96k 24-bit.flac"), "เพลงจริง 96k 24-bit"); await plotReady();
  const songSecs = ((Date.now() - tSong) / 1000).toFixed(1);
  await view("wave");
  const infoSong = await text("[data-graphinfo]");
  check("เพลงจริง FLAC 96 kHz 24 บิต เปิดได้ แถบ L R การ์ดบอก FLAC 2 channels 96 kHz 24-bit", (await q("return [...document.querySelectorAll('[data-lane]')].map(l => l.dataset.lane).join(' ')")) === "L R" && /FLAC/.test(infoSong) && infoSong.includes("2 channels") && infoSong.includes("96 kHz") && infoSong.includes("24-bit"), `${infoSong} · อ่านทั้งเพลง 5 นาที 14 วินาที ใช้ ${songSecs} วินาที`);
  await shot("26-เพลงจริง-รูปคลื่น.png");
  await view("loud");
  check("เพลงจริง ความดังรวม", /LUFS/.test(await text("[data-graphtiles]")), await text("[data-graphtiles]"));
  await shot("27-เพลงจริง-ความดัง.png");
  await view("spek"); await sleep(600);
  const vSong = await text("[data-spekverdict]");
  check("เพลงจริง FLAC วิเคราะห์ ไม่ขึ้นเตือนว่าแปลงมาจาก MP3", !vSong.includes("แปลงมาจาก MP3"), vSong);
  await shot("28-เพลงจริง-วิเคราะห์-FLAC.png");
  await openDrop(A("เพลงจริง MP3 320k.mp3"), "เพลงจริง MP3 320k"); await plotReady(); await sleep(600);
  const vMp3 = await text("[data-spekverdict]");
  check("เพลงจริง MP3 320k วิเคราะห์ บอกเสียงสูงสุด และว่าเป็นปกติของ MP3", vMp3.includes("ปกติของ MP3"), vMp3);
  await shot("29-เพลงจริง-วิเคราะห์-MP3.png");
  await openDrop(A("เพลงจริง AAC 256k.m4a"), "เพลงจริง AAC 256k"); await plotReady(); await sleep(600);
  const vAac = await text("[data-spekverdict]");
  check("เพลงจริง AAC 256k เปิดได้ วิเคราะห์บอกว่าเป็นปกติของ AAC", vAac.includes("ปกติของ AAC") && (await text("[data-graphinfo]")).includes("AAC"), vAac);
  await shot("30-เพลงจริง-วิเคราะห์-AAC.png");
  await openDrop(A("เพลงจริง FLAC แปลงจาก MP3.flac"), "เพลงจริง FLAC แปลงจาก"); await plotReady(); await sleep(600);
  const vSongFake = await text("[data-spekverdict]");
  check("เพลงจริง FLAC ที่แปลงมาจาก MP3 128k ขึ้นเตือนว่าน่าจะแปลงมา", vSongFake.includes("แปลงมาจาก MP3 หรือ AAC"), vSongFake);
  await shot("31-เพลงจริง-FLAC-ปลอม.png");
  await view("psd");
  await waitFor("return !!document.querySelector('[data-psdverdict]')", 30000);
  await openDrop(A("เพลงจริง 96k 24-bit.flac"), "เพลงจริง 96k 24-bit"); await plotReady();
  await waitFor("return !!document.querySelector('[data-psdverdict]')", 30000);
  await hoverMid("[data-psdbox]", 0.3, 0.5);
  check("เพลงจริง ความถี่เฉลี่ย ชี้แล้วบอกโน้ต", (await text(".tip")).includes("โน้ต"), await text(".tip"));
  await shot("32-เพลงจริง-ความถี่เฉลี่ย.png");
  await c.move(500, 12);
  await view("wave");
} else console.log("ข้าม เพลงจริงจากพี่กัน · ไม่มีไฟล์ " + SONG);

/* ---------- 12ค ไฟล์ทดสอบลำโพงจริงจากพี่กัน 5.1 กับ 7.1 (ได้มา 7 พ.ย. 2569 · ไม่ขึ้น git) ---------- */
// ไฟล์เล่นทีละช่อง ช่องละราว 2 วินาที · หาว่าแต่ละช่องดังช่วงไหนจากภาพรวมที่โปรแกรมอ่าน แล้วเทียบกับชื่อแถบบนจอ
for (const [file, name] of [["surround-test-5.1.wav", "5.1"], ["surround-test-7.1.wav", "7.1"]]) {
  const src = join("test-media", "จากพี่กัน", file);
  if (!existsSync(src)) { console.log("ข้าม ไม่มีไฟล์ " + src); continue; }
  const dst = A(`ทดสอบลำโพงจริง ${name}.wav`);
  copyFileSync(src, dst);
  await view("wave");
  await openDrop(dst, `ทดสอบลำโพงจริง ${name}`); await plotReady();
  const shown = await q("return [...document.querySelectorAll('[data-lane]')].map(l => l.dataset.lane)");
  const g = await inv("graph_info", { path: dst });
  const o = await inv("graph_overview", { path: dst, track: 0 });
  // ช่วงที่ช่องนั้นดังกว่ายอดของตัวเอง −20 dB · ได้เวลาเริ่ม จบ ของแต่ละช่อง
  const spans = o.env.map((e) => {
    const rms = []; for (let k = 0; k < o.cols; k++) rms.push(e[k * 3 + 2]);
    const top = Math.max(...rms), on = rms.map((v, k) => (v > top * 0.1 ? k : -1)).filter((k) => k >= 0);
    return on.length ? [on[0] / o.cols * o.duration, (on[on.length - 1] + 1) / o.cols * o.duration] : [NaN, NaN];
  });
  const order = g.tracks[0].names.map((c, i) => [c, spans[i]]).sort((a, b) => a[1][0] - b[1][0]);
  const overlap = order.some((x, i) => i && x[1][0] < order[i - 1][1][1] - 0.3);
  check(`ไฟล์ทดสอบลำโพงจริง ${name} แถบครบ ${g.tracks[0].names.length} ช่อง แต่ละช่องดังคนละช่วง ไม่ทับกัน`, shown.length === g.tracks[0].names.length && !overlap,
    `แถบบนจอ ${shown.join(" ")} · ลำดับที่ดัง ${order.map(([c, [a, b]]) => `${c} ${a.toFixed(1)}–${b.toFixed(1)} วิ`).join(" · ")}`);
  await hoverMid("[data-lanes]", 0.05, 0.3);
  await shotHere(`33-ทดสอบลำโพงจริง-${name}.png`);
  await c.move(500, 12);
}

/* ---------- 13 บันทึกรูป บันทึกตาราง (ตัวเขียนไฟล์ฝั่ง Rust · กล่องบันทึกของ Windows กดจากตัวเทสไม่ได้) ---------- */
await openDrop(A("ทดสอบลำโพง 7.1.flac"), "ทดสอบลำโพง 7.1"); await plotReady();
const png = join(AUD, "บันทึก กราฟเสียง.png");
const s1 = await c.evaluate(`window.__TAURI_INTERNALS__.invoke('graph_save', { path: ${JSON.stringify(png)}, b64: document.querySelector('[data-lane] canvas').toDataURL('image/png'), text: null })`);
const s2 = await c.evaluate(`window.__TAURI_INTERNALS__.invoke('graph_save', { path: ${JSON.stringify(png)}, b64: document.querySelector('[data-lane] canvas').toDataURL('image/png'), text: null })`);
const head = readFileSync(s1).subarray(0, 8).toString("hex");
check("บันทึกเป็นรูป ได้ไฟล์ PNG จริง · บันทึกซ้ำชื่อเดิมไม่เขียนทับ ได้ชื่อ (2)", head === "89504e470d0a1a0a" && s2.endsWith("บันทึก กราฟเสียง (2).png"), `${s1} · ${s2}`);
const csv = await inv("graph_save", { path: join(AUD, "ตาราง.csv"), b64: null, text: "Hz,รวมทุกช่อง dB\r\n50.00,-30.0" });
check("ส่งออกเป็นตาราง CSV มี BOM ให้ Excel อ่านภาษาไทยถูก", readFileSync(csv).subarray(0, 3).toString("hex") === "efbbbf");

/* ---------- 14 ไฟล์ยาว กดหยุด อ่านใหม่ จับเวลา ---------- */
await openDrop(A("ยาว 20 นาที 5.1.ac3"), "ยาว 20 นาที 5.1");
await waitFor("return !!document.querySelector('[data-graphloading]')", 10000);
await waitFor("return parseInt(document.querySelector('[data-graphloading] b')?.innerText ?? '0') >= 5", 30000);
const jobs = await inv("running_jobs");
check("ระหว่างอ่านเสียง นับเป็นงานที่รันอยู่ ปิดโปรแกรมแล้วถามก่อน", jobs >= 1, `งาน ${jobs}`);
await shot("23-ไฟล์ยาว-กำลังอ่าน.png");
await clickText("[data-graphloading] button", "หยุด");
await waitFor("return !!document.querySelector('[data-grapherror]')", 10000);
const stopped = await text("[data-grapherror]");
check("กดหยุดกลางทาง ขึ้นว่าหยุดอ่านเสียงแล้ว พร้อมปุ่มอ่านใหม่", stopped.includes("หยุดอ่านเสียงแล้ว") && (await count("[data-graphretry]")) === 1, stopped);
await shot("24-กดหยุดแล้ว.png");
await sleep(500);
check("หยุดแล้วงานที่รันอยู่หายไป", (await inv("running_jobs")) === 0);
await c.click("[data-graphretry]");
const tLong = Date.now();
await waitFor("return !!document.querySelector('[data-graphloading]')", 10000);
await plotReady();
const secs = (Date.now() - tLong) / 1000;
check("กดอ่านใหม่ อ่านจนจบ ขึ้นกราฟ 6 ช่อง", (await count("[data-lane]")) === 6, `ไฟล์ 20 นาที 5.1 อ่านทั้งเรื่อง ${secs.toFixed(1)} วินาที`);
// เปิดซ้ำ ใช้ผลที่อ่านไว้ ขึ้นทันที
await openDrop(A("เสียงเดียว.mp3"), "เสียงเดียว"); await plotReady();
const tAgain = Date.now();
await openDrop(A("ยาว 20 นาที 5.1.ac3"), "ยาว 20 นาที 5.1"); await plotReady();
const again = Date.now() - tAgain;
check("เปิดไฟล์เดิมซ้ำ ใช้ผลที่อ่านไว้ ขึ้นภายใน 2 วินาที", again < 2000, `${again} ms`);
await shot("25-ไฟล์ยาว-อ่านเสร็จ.png");

if (BUILT) {
  const csp = await q("return window.__csp ?? null");
  check("ตัวโปรแกรมที่สร้างจริง ไม่มีอะไรโดนกติกาความปลอดภัยกันตลอดการเทส", Array.isArray(csp) && csp.length === 0, JSON.stringify(csp));
}
await closeToasts();
const pass = results.filter((r) => r.pass).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 1));
await c.close?.();
process.exit(pass === results.length ? 0 : 1);
