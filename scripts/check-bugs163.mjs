// ตัวตรวจงาน BUGS ข้อ 163 (เคาะรายการเลข 16 ถึง 53 รอบแรก 28 พ.ย. 2569)
// เปิดหน้าจอจริงในระบบจำลองหน้าโปรแกรมบนเว็บ (docs/mockups/theme-live-app.html) ด้วย Playwright ไม่ต้องเปิดโปรแกรม ไม่ขึ้นจอ ใช้ได้บนเครื่องคลาวด์
// ใช้เซิร์ฟเวอร์ 1420 ที่เปิดอยู่ ไม่มีก็เปิด vite เองแล้วปิดตอนจบ · ตัวช่วยกับตัวรันยกจาก check-bugs162.mjs
// node scripts/check-bugs163.mjs            ตรวจทุกข้อ
// node scripts/check-bugs163.mjs 2          ตรวจเฉพาะข้อย่อย 163.2 (ส่งเลขหลังจุด)
// SHOTS=<โฟลเดอร์> ถ่ายภาพหน้าจอท้ายแต่ละข้อไว้ดูด้วยตา (ข้อ-<เลข>.png)
import { spawn } from "child_process";
import { createRequire } from "module";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { linesOf } from "./lib/lines.mjs";

if (process.platform === "win32") process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const BASE = "http://127.0.0.1:1420", URL = `${BASE}/docs/mockups/theme-live-app.html`;
const SUB_MOVIE = "D:\\หนัง\\ฉากตัด (2024).mkv"; // ข้อมูลตัวอย่างของหน้าแก้ซับ (SE_PATH ใน theme-live-app.html)
const up = async () => { try { return (await fetch(URL)).ok; } catch { return false; } };

// ---------------------------------------------------------------- ตัวช่วย
const nav = (p, label) => p.evaluate((l) => { const b = [...document.querySelectorAll("[data-navbar] button")].find((x) => x.querySelector(".navtxt")?.textContent.trim() === l); if (!b) throw new Error("ไม่เจอเมนู " + l); b.click(); }, label);
const click = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("ไม่เจอ " + s); e.click(); }, sel);
const clickText = (p, text, sel = "button,[role=tab],a") => p.evaluate(([t, s]) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const all = [...document.querySelectorAll(s)].filter(vis);
  const hit = all.find((e) => e.innerText.trim() === t) ?? all.find((e) => e.innerText.trim().startsWith(t));
  if (!hit) throw new Error("ไม่เจอปุ่ม " + t);
  hit.click();
}, [text, sel]);
const pick = (p, path) => p.evaluate((x) => { window.__pickNext = x; }, path);
/** สลับคำตอบของคำสั่งในระบบจำลอง · body เป็นฟังก์ชัน async ได้ตัวแปร a · เรียกตัวเดิมด้วย await window.__fxOverBase.<คำสั่ง>(a) */
const over = (p, cmd, body) => p.evaluate(([c, b]) => { const AF = Object.getPrototypeOf(async function () {}).constructor; (window.__fxOver ??= {})[c] = new AF("a", b); }, [cmd, body]);
/** สลับคำตอบตั้งแต่ก่อนหน้าโหลด (คำสั่งที่โปรแกรมเรียกตอนเปิด) แล้วโหลดหน้าใหม่ */
const overBoot = async (p, cmd, body) => {
  await p.addInitScript(([c, b]) => { const AF = Object.getPrototypeOf(async function () {}).constructor; (window.__fxOver ??= {})[c] = new AF("a", b); }, [cmd, body]);
  await p.reload(); await p.waitForSelector("[data-navbar]"); await wait(p, 1500);
};
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText ?? null, sel);
const wait = (p, ms) => p.waitForTimeout(ms);
/** เรียกฟังก์ชันจากไฟล์ ts ในหน้า · fn เป็นข้อความ body ที่ได้ตัวแปร m (โมดูล) กับ a (ค่าที่ส่ง) */
const mod = (p, file, body, arg) => p.evaluate(async ([f, b, a]) => new Function("m", "a", b)(await import(f), a), [file, body, arg]);

// ---------------------------------------------------------------- ข้อตรวจ แต่ละข้อเปิดหน้าใหม่ ข้อมูลตัวอย่างชุดเดิม
const T = {};
const ROOT = fileURLToPath(new globalThis.URL("..", import.meta.url));
const walk = (d, out = []) => { for (const n of readdirSync(d)) { const f = join(d, n); if (statSync(f).isDirectory()) walk(f, out); else out.push(f); } return out; };
/** บรรทัดที่เป็นคอมเมนต์ล้วน ไม่ใช่ข้อความบนจอ */
const isComment = (l) => /^\s*(\/\/|\/\*|\*|\{\/\*)/.test(l);

/** 163.2 (เลข 16) คำฝั่งวิดีโอ ครอบเป็น MKV เปลี่ยนเป็น ห่อเป็น MKV ทั้งโปรแกรม */
T[2] = async (p, check) => {
  // ① ซอร์สหน้าจอกับข้อความจากฝั่ง Rust ไม่มีคำว่าครอบในความหมายห่อไฟล์เหลือ (ครอบครัว ที่ครอบ ครอบภาพ เป็นคนละความหมาย)
  const files = [...walk(join(ROOT, "src")), ...walk(join(ROOT, "src-tauri", "src"))].filter((f) => /\.(tsx?|rs)$/.test(f));
  const left = [];
  for (const f of files) readFileSync(f, "utf8").split("\n").forEach((l, i) => { if (!isComment(l) && /ครอบ(เป็น| ?MKV|เสร็จ|ใหม่|ไฟล์|\$\{J\})|ยังไม่ได้ครอบ|หลังครอบ|ก่อนครอบ|ระหว่างครอบ/.test(l)) left.push(`${f.slice(ROOT.length)}:${i + 1}`); });
  check("163.2 ซอร์สไม่มีข้อความบนจอที่ใช้คำว่าครอบในความหมายห่อเป็น MKV", left.length === 0, left.join(" , "));
  // ② ป้ายอธิบายสีของชั้นวาง
  const legend = await p.evaluate(() => document.body.innerText.includes("ยังไม่ได้ห่อเป็น MKV"));
  check("163.2 ชั้นวางขึ้นป้ายอธิบายสี ยังไม่ได้ห่อเป็น MKV", legend, "");
  // ③ หน้าตั้งค่าหัวข้อใส่โปสเตอร์ ป้ายสามแถวใช้คำใหม่ และอยู่บรรทัดเดียวที่หน้าต่าง 1280 × 800
  await nav(p, "ตั้งค่า"); await wait(p, 600);
  await p.evaluate(() => [...document.querySelectorAll("button,a,[role=tab],li")].filter((x) => !x.closest("[data-navbar]")).find((x) => x.textContent.trim() === "ใส่โปสเตอร์")?.click()); await wait(p, 500);
  const rows = await p.evaluate(() => [...document.querySelectorAll("[data-setcard=poster] .setrow > .lbl")].map((l) => { const t = [...l.childNodes].find((n) => n.nodeType === 3); if (!t) return null; const r = document.createRange(); r.selectNodeContents(t); return { t: t.textContent.trim(), lines: new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size }; }).filter(Boolean));
  const wantRows = ["ตรวจไฟล์ต้นทางก่อนห่อเป็น MKV", "ตรวจไฟล์ใหม่หลังห่อเป็น MKV", "ไฟล์เดิมหลังห่อเป็น MKV"];
  check("163.2 หน้าตั้งค่า ป้ายสามแถวใช้คำว่าห่อเป็น MKV และอยู่บรรทัดเดียว", wantRows.every((w) => rows.some((r) => r.t === w && r.lines === 1)) && !rows.some((r) => r.t.includes("ครอบ")), JSON.stringify(rows));
  // ④ หน้าใส่โปสเตอร์ ปุ่มเริ่มกับหัวข้อไฟล์เดิม
  await nav(p, "ใส่โปสเตอร์"); await wait(p, 600);
  const pg = await p.evaluate(() => document.body.innerText);
  check("163.2 หน้าใส่โปสเตอร์ ปุ่มเริ่มเป็น ห่อเป็น MKV พร้อมโปสเตอร์ และหัวข้อไฟล์เดิมหลังห่อเป็น MKV", pg.includes("ห่อเป็น MKV พร้อมโปสเตอร์") && pg.includes("ไฟล์เดิมหลังห่อเป็น MKV") && !/ครอบ/.test(pg), "");
};

/** 163.8 โทนสีฟ้าน้ำทะเล (teal) */
T[8] = async (p, check) => {
  const t = await p.evaluate(async () => { const m = await import("/src/lib/tones.ts"); const x = m.TONES.find((q) => q.id === "teal"); return x ? { name: x.name, con: m.minContrast(x), dark: !!x.dark } : null; });
  check("163.8 มีโทนฟ้าน้ำทะเลในรายการโทน คู่สีที่จางสุดผ่านเกณฑ์ 4.5", !!t && t.name === "ฟ้าน้ำทะเล" && t.con >= 4.5 && !t.dark, JSON.stringify(t));
  await p.evaluate(() => window.__applyTone("teal")); await wait(p, 400);
  // สีจุดเน้น ตัวแปร --accent กับสีพื้นปุ่มหลักที่ไฟล์สไตล์เขียนเป็นชมพู ต้องหมุนมาเป็นโทนเขียวอมฟ้า (hue ราว 160 ถึง 200)
  const c = await p.evaluate(() => { const hue = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => v / 255); const a = Math.max(r, g, b), z = Math.min(r, g, b), d = a - z; if (!d) return -1; return (a === r ? ((g - b) / d + 6) % 6 : a === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; };
    const btn = [...document.querySelectorAll(".btn-main")].find((e) => e.getBoundingClientRect().width); const nav = document.querySelector(".side .nav.on");
    return { accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), btn: btn ? hue(getComputedStyle(btn).backgroundColor) : null, nav: nav ? hue(getComputedStyle(nav).backgroundColor) : null }; });
  check("163.8 เลือกโทนแล้ว --accent เป็น #1d7472 ปุ่มหลักกับเมนูที่เลือกเป็นสีเขียวอมฟ้า", c.accent.toLowerCase() === "#1d7472" && c.btn > 160 && c.btn < 200 && c.nav > 160 && c.nav < 200, JSON.stringify(c));
  // การ์ดโทนในหน้าตั้งค่า
  await nav(p, "ตั้งค่า"); await wait(p, 500);
  await p.evaluate(() => [...document.querySelectorAll("button,a,li")].filter((x) => !x.closest("[data-navbar]")).find((x) => x.textContent.trim() === "โทนสี")?.click()); await wait(p, 500);
  const n = await p.evaluate(() => [...document.querySelectorAll(".tncard")].map((e) => e.innerText.split("\n")[0].trim()));
  check("163.8 หน้าตั้งค่าหัวข้อโทนสีมีการ์ดฟ้าน้ำทะเลเป็นการ์ดที่หก", n.length === 6 && n[5].startsWith("ฟ้าน้ำทะเล"), JSON.stringify(n));
  await p.evaluate(() => window.__applyTone("quartz"));
};

const MOVIE = "D:\\หนัง\\ดาวเหนือ (2023).mkv";
const SONG = "D:\\เพลง\\เพลงตัวอย่าง.flac";
const avDrop = (p, path) => p.evaluate((x) => window.__emit("tauri://drag-drop", { paths: [x], position: { x: 700, y: 400 } }), path);
const graphOpen = async (p, path) => { await nav(p, "กราฟเสียง"); await wait(p, 300); await avDrop(p, path); await p.waitForSelector("[data-plot]", { timeout: 15000 }); await wait(p, 800); };
const gp = (p) => p.evaluate(() => window.__graphPlay());

/** 163.4 (เลข 35) เล่นเสียงจากกราฟ มีขีดเลื่อนตาม */
T[4] = async (p, check) => {
  await graphOpen(p, MOVIE);
  await p.click("[data-view=wave]").catch(() => {}); await wait(p, 500);
  const bar = await p.evaluate(() => { const b = document.querySelector("[data-playbar]"); const r = b?.getBoundingClientRect(); return b ? { h: Math.round(r.height), txt: b.innerText, over: document.querySelector(".agstick").scrollWidth > document.querySelector(".agstick").clientWidth + 1 } : null; });
  check("163.4 แถบเล่นอยู่ใต้แถวปุ่มมุมมอง สูง 30 จุด มีปุ่มเล่นในหน้านี้ เวลา และความดัง ไม่ล้นขวาที่ 1280", !!bar && bar.h === 30 && bar.txt.includes("เล่นในหน้านี้") && /จาก/.test(bar.txt) && /%/.test(bar.txt) && !bar.over, JSON.stringify(bar));
  // กราฟไม่ดันหน้าจนต้องเลื่อน (หักความสูงแถบเล่นออกจากความสูงกราฟแล้ว)
  const fit = await p.evaluate(() => { const w = document.querySelector("[data-graphscroll]"); return { sh: w.scrollHeight, ch: w.clientHeight }; });
  check("163.4 หน้ารูปคลื่นที่ 1280 × 800 ไม่ต้องเลื่อนแนวตั้ง", fit.sh <= fit.ch + 1, JSON.stringify(fit));
  // กดเล่น เวลาเดิน ขอเสียงจากฝั่ง Rust ครบทุกช่อง (5.1 = 6 ช่อง) ขีดตำแหน่งเล่นขึ้นบนกราฟ แถบวัดระดับขึ้นทุกช่อง
  const w0 = await p.evaluate(() => document.querySelector("[data-gplay]").getBoundingClientRect().width);
  await p.click("[data-gplay]"); await wait(p, 1200);
  const a = await gp(p);
  const w1 = await p.evaluate(() => document.querySelector("[data-gplay]").getBoundingClientRect().width);
  check("163.4 ปุ่มเล่นกว้างเท่าเดิมตอนสลับเป็นปุ่มหยุดชั่วคราว", Math.abs(w0 - w1) < 0.5, JSON.stringify({ w0, w1 }));
  await wait(p, 700);
  const b2 = await gp(p);
  const head = await p.evaluate(() => { const h = document.querySelector(".lanes [data-playhead]"); return h ? { show: h.style.display, left: parseFloat(h.style.left) } : null; });
  const meters = await p.evaluate(() => document.querySelectorAll(".lanes [data-meter]").length);
  check("163.4 กดเล่นแล้วกำลังเล่น เวลาเดินหน้า ถอดครบหกช่องของแทร็ก 5.1", a.playing && b2.now > a.now + 0.4 && a.names.length === 6, JSON.stringify({ a, b2 }));
  check("163.4 ขีดตำแหน่งเล่นขึ้นบนกราฟรูปคลื่นและขยับตามเวลา", !!head && head.show === "block" && head.left > 96, JSON.stringify(head));
  check("163.4 แถบวัดระดับเสียงขึ้นข้างชื่อช่องครบทุกช่องตอนเล่น", meters === 6, String(meters));
  const lv = await p.evaluate(() => [...document.querySelectorAll(".lanes [data-meter] > i")].map((i) => parseFloat(i.style.height)));
  check("163.4 แถบวัดของช่องที่ดังกว่า (ช่องแรก) ขึ้นสูงกว่าช่องสุดท้าย", lv.length === 6 && lv[0] < lv[5], JSON.stringify(lv));
  // ปุ่มลำโพงปิดช่อง FC ระหว่างเล่น เสียงช่องนั้นเงียบทันที แถบช่องนั้นหยุดนิ่ง
  await p.click("[data-lanetog=C]").catch(async () => { await p.click("[data-lane] [data-lanetog]:nth-of-type(1)"); }); await wait(p, 300);
  const m = await gp(p);
  check("163.4 ปุ่มลำโพงปิดช่องระหว่างเล่น ช่องนั้นเงียบทันที ช่องอื่นยังดัง", m.muted.length === 1 && m.gains.filter((g) => g === 0).length === 1 && m.gains.filter((g) => g === 1).length === 5 && m.playing, JSON.stringify(m));
  // กดบนกราฟระหว่างเล่น กระโดดไปเล่นตรงนั้น
  // จุดที่กดคิดจากกรอบของกราฟจริง (canvas ของช่องแรก) ซูมทั้งไฟล์ 1:30:00 สามในสี่คือ 4,050 วินาที
  const cv = await p.evaluate(() => { const r = document.querySelector(".lanes .lane:not([data-off]) canvas.cv").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
  await p.mouse.click(cv.x + cv.w * 0.75, cv.y + 20); await wait(p, 900);
  const j = await gp(p);
  check("163.4 กดบนกราฟระหว่างเล่น กระโดดไปเล่นตรงจุดที่กด (สามในสี่ของไฟล์ราว 4,050 วินาที)", j.playing && Math.abs(j.now - 4050) < 20, JSON.stringify({ now: j.now }));
  // เว้นวรรคหยุด จุดเริ่มเล่นครั้งถัดไปคือจุดที่หยุด
  await p.mouse.move(5, 5); await p.keyboard.press("Space"); await wait(p, 300);
  const st = await gp(p);
  const shown = await p.evaluate(() => document.querySelector("[data-gptime] span")?.textContent);
  check("163.4 เว้นวรรคหยุดเล่น ตัวเลขเวลาค้างที่จุดที่หยุด", !st.playing && /^1:/.test(shown ?? ""), JSON.stringify({ st, shown }));
  await p.keyboard.press("Space"); await wait(p, 900);
  const again = await gp(p);
  check("163.4 เว้นวรรคอีกครั้งเล่นต่อจากจุดที่หยุด", again.playing && again.now >= j.now, JSON.stringify({ again: again.now, stop: j.now }));
  // ความดังลำโพง จำไว้ ไม่เกี่ยวกับแถบวัด
  await p.evaluate(() => { const r = document.querySelector("[data-gpvol]"); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(r, "40"); r.dispatchEvent(new Event("input", { bubbles: true })); });
  await wait(p, 200);
  const vol = await p.evaluate(() => ({ st: window.__graphPlay().vol, saved: localStorage.getItem("ms.graphVol"), txt: document.querySelector(".gp-volv")?.textContent }));
  check("163.4 แถบความดังลำโพงปรับเป็น 40% และจำไว้", Math.abs(vol.st - 0.4) < 1e-6 && vol.saved === "0.4" && vol.txt === "40%", JSON.stringify(vol));
  // เปลี่ยนไปหน้าอื่น หยุดเล่น
  await nav(p, "ชั้นวางหนัง"); await wait(p, 300);
  check("163.4 ออกจากหน้ากราฟแล้วหยุดเล่น", !(await gp(p)).playing, "");
  await p.evaluate(() => localStorage.removeItem("ms.graphVol"));
  // หน้าวิเคราะห์กับหน้าความดังมีขีดตำแหน่งเล่นด้วย
  await nav(p, "กราฟเสียง"); await wait(p, 400);
  for (const v of ["spek", "loud"]) {
    await p.click(`[data-view=${v}]`); await wait(p, 700);
    await p.click("[data-gplay]"); await wait(p, 900);
    const h = await p.evaluate(() => [...document.querySelectorAll("[data-playhead]")].filter((x) => x.style.display === "block").length);
    check(`163.4 มุมมอง ${v} มีขีดตำแหน่งเล่นตอนเล่น`, h >= 1, String(h));
    await p.click("[data-gplay]"); await wait(p, 200);
  }
  // กล่อง ⓘ ของแถบเล่น แยกหัวข้อละเรื่อง ตัดบรรทัดตรงรอยต่อความหมาย (หน้าต่าง 1280 × 800)
  await click(p, '[data-info="เล่นเสียงจากกราฟ"]'); await p.waitForSelector('[data-tip="เล่นเสียงจากกราฟ"]'); await wait(p, 300);
  const lines = await linesOf((code) => p.evaluate(`(async () => { ${code} })()`), '[data-tip="เล่นเสียงจากกราฟ"]');
  if (process.env.DUMP) console.log(JSON.stringify(lines, null, 1));
  const want = [
    "เล่นเสียงของไฟล์ในหน้านี้เลย โดยมีขีดตำแหน่งเล่นวิ่งไปบนกราฟ ⏎ จึงเห็นว่าเสียงที่ได้ยินอยู่ตรงไหนของกราฟ",
    "กดบนกราฟ ระหว่างเล่น กดตรงไหนก็กระโดดไปเล่นตรงนั้น ⏎ ส่วนตอนหยุด จุดที่กดจะเป็นจุดเริ่มเล่นครั้งถัดไป",
    "ปุ่มลำโพง ช่องที่ปิดลำโพงจะเงียบทันทีระหว่างเล่น ⏎ และแถบวัดระดับของช่องนั้นหยุดนิ่ง",
    "ความดัง ปรับเฉพาะเสียงที่ออกลำโพง ไม่แก้ไฟล์ ⏎ ส่วนแถบวัดระดับข้างชื่อช่องบอกระดับของไฟล์จริงเสมอ",
    "แถบวัดระดับ เขียวคือระดับปกติ เหลืองคือดังใกล้เพดาน ⏎ และแดงคือแตะ 0 dB ซึ่งจุดแดงค้างไว้จนกดล้าง",
    "ปุ่มควบคุม ไปต้นไฟล์ เล่นหรือหยุดชั่วคราว และไปท้ายไฟล์ ⏎ ส่วนปุ่มหยุดจะหยุดแล้วกลับไปจุดที่เริ่มเล่น",
    "เล่นวน เล่นจบแล้วกลับไปเล่นจากจุดเริ่มอีกรอบ จนกว่าจะปิดปุ่มนี้",
  ];
  check("163.4 กล่อง ⓘ เล่นเสียงจากกราฟ แยกหัวข้อละเรื่อง ตัดบรรทัดตรงความหมายทุกหัวข้อ", JSON.stringify(lines) === JSON.stringify(want), JSON.stringify(lines));
  await p.keyboard.press("Escape");
  // คีย์ลัดอยู่ในทะเบียนกลาง ตั้งใหม่ได้ในหน้าตั้งค่า
  const k = await p.evaluate(async () => { const m = await import("/src/lib/keymap.ts"); const a = m.actionOf("graph.play"); return a ? { keys: a.keys, group: m.KEY_GROUPS.find((g) => g.id === a.group)?.title } : null; });
  check("163.4 คีย์ลัดเล่นหรือหยุดอยู่ในทะเบียนกลาง หมวดหน้ากราฟเสียง ตั้งต้นเป็น Space", !!k && k.keys[0] === "Space" && k.group === "หน้ากราฟเสียง", JSON.stringify(k));
};

/** 163.5 (เลข 36) ปุ่มเล่นแบบ Audacity เล่น หยุดชั่วคราว หยุด ไปต้นไฟล์ ไปท้ายไฟล์ เล่นวน */
T[5] = async (p, check) => {
  const step = (x) => { if (process.env.STEP) console.log("· " + x); };
  await graphOpen(p, SONG); step("open");
  await p.click("[data-view=wave]").catch(() => {}); await wait(p, 400);
  const btns = await p.evaluate(() => ["gphome", "gplay", "gpstop", "gpend", "gploop"].map((k) => { const b = document.querySelector(`[data-${k}]`); return b ? { k, label: b.getAttribute("aria-label") ?? b.innerText.trim(), title: b.title } : null; }));
  check("163.5 แถบเล่นมีห้าปุ่ม ไปต้นไฟล์ เล่น หยุด ไปท้ายไฟล์ เล่นวน เรียงตามแบบ Audacity", btns.every(Boolean) && btns.map((b) => b.k).join() === "gphome,gplay,gpstop,gpend,gploop", JSON.stringify(btns));
  const stopOff = await p.evaluate(() => { const b = document.querySelector("[data-gpstop]"); return { off: b.classList.contains("off"), title: b.title }; });
  check("163.5 ยังไม่ได้เล่น ปุ่มหยุดกดไม่ได้และบอกเหตุผลติดปุ่ม", stopOff.off && stopOff.title.includes("ยังไม่ได้เล่น"), JSON.stringify(stopOff));
  // เล่นจากจุดที่กดบนกราฟ (ราวครึ่งไฟล์ 248 วินาที) แล้วหยุดชั่วคราว ขีดค้างที่จุดที่หยุด
  const cv = await p.evaluate(() => { const r = document.querySelector(".lanes .lane canvas.cv").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; });
  await p.mouse.click(cv.x + cv.w * 0.5, cv.y + 20); await wait(p, 200);
  await p.click("[data-gplay]"); await wait(p, 1300);
  await p.click("[data-gplay]"); await wait(p, 300);
  const pz = await gp(p);
  const head = await p.evaluate(() => document.querySelector(".lanes [data-playhead]")?.style.display);
  const lbl = await p.evaluate(() => document.querySelector("[data-gplay]").innerText.trim());
  check("163.5 หยุดชั่วคราว ขีดตำแหน่งเล่นค้างที่จุดที่หยุด ปุ่มกลับเป็นเล่น", !pz.playing && pz.paused && pz.pos > 124 && head === "block" && lbl === "เล่นในหน้านี้", JSON.stringify({ pz, head, lbl }));
  await p.click("[data-gplay]"); await wait(p, 900);
  const rs = await gp(p);
  check("163.5 กดเล่นอีกครั้งเล่นต่อจากจุดที่หยุดชั่วคราว", rs.playing && rs.now >= pz.pos && rs.now < pz.pos + 3, JSON.stringify({ now: rs.now, pos: pz.pos }));
  // หยุด กลับไปจุดที่เริ่มเล่น (จุดที่กดบนกราฟ) ขีดหาย
  await p.click("[data-gpstop]"); await wait(p, 300);
  const sp = await gp(p);
  const shown = await p.evaluate(() => document.querySelector("[data-gptime] span")?.textContent);
  check("163.5 ปุ่มหยุด หยุดเล่นแล้วกลับไปจุดที่เริ่มเล่น ตัวเลขเวลาเป็นจุดเริ่ม", !sp.playing && !sp.paused && /^2:0[34]\./.test(shown ?? ""), JSON.stringify({ sp, shown }));
  // ไปต้นไฟล์ระหว่างเล่น เล่นต่อจากศูนย์
  await p.click("[data-gplay]"); await wait(p, 600);
  await p.click("[data-gphome]"); await wait(p, 900);
  const hm = await gp(p);
  check("163.5 ไปต้นไฟล์ระหว่างเล่น เล่นต่อจากต้นไฟล์", hm.playing && hm.now < 2, JSON.stringify(hm.now));
  // ไปท้ายไฟล์ หยุดเล่น เวลาเป็นความยาวไฟล์
  await p.click("[data-gpend]"); await wait(p, 300);
  const en = await gp(p);
  const endTxt = await p.evaluate(() => document.querySelector("[data-gptime] span")?.textContent);
  check("163.5 ไปท้ายไฟล์ หยุดเล่น เวลาเป็นท้ายไฟล์ 4:08", !en.playing && /^4:08/.test(endTxt ?? ""), JSON.stringify({ en, endTxt }));
  // เล่นวน เปิดแล้วจำไว้ เล่นจากใกล้ท้ายไฟล์ จบแล้ววนกลับไปจุดเริ่ม
  await p.click("[data-gploop]"); await wait(p, 200);
  const lp = await p.evaluate(() => ({ on: document.querySelector("[data-gploop]").getAttribute("aria-pressed"), saved: localStorage.getItem("ms.graphLoop") }));
  check("163.5 ปุ่มเล่นวนเปิดแล้วเป็นสีที่เลือก และจำไว้", lp.on === "true" && lp.saved === "1", JSON.stringify(lp));
  await p.mouse.click(cv.x + cv.w * (246.5 / 248), cv.y + 20); await wait(p, 200);
  await p.click("[data-gplay]"); await wait(p, 3200);
  const lo = await gp(p);
  check("163.5 เล่นวน เล่นจบไฟล์แล้วกลับไปเล่นจากจุดเริ่มอีกรอบ", lo.playing && lo.now > 245 && lo.now < 248, JSON.stringify(lo.now));
  await click(p, "[data-gploop]"); await click(p, "[data-gpstop]"); await wait(p, 200);
  await p.evaluate(() => localStorage.removeItem("ms.graphLoop"));
  // คีย์ลัดของปุ่มควบคุมอยู่ในทะเบียนกลาง ตั้งได้ในหน้าตั้งค่า
  const k = await p.evaluate(async () => { const m = await import("/src/lib/keymap.ts"); return ["graph.stop", "graph.home", "graph.end", "graph.loop"].map((id) => !!m.actionOf(id)); });
  check("163.5 คำสั่ง หยุด ไปต้นไฟล์ ไปท้ายไฟล์ เล่นวน อยู่ในทะเบียนคีย์ลัด ตั้งเองได้", k.every(Boolean), JSON.stringify(k));
};

/** 163.6 (เลข 39) หน้าบิตเรตตอนดูแทร็กเสียง มีรูปคลื่นเสียงใต้แถบภาพรวม พับเก็บได้ */
const brAudio = async (p) => {
  // ระบบจำลองมีข้อมูลบิตเรตของวิดีโออย่างเดียว ตัวตรวจสลับคำตอบให้เป็นแทร็กเสียงของไฟล์เพลง
  await over(p, "bitrate_tracks", "return [{ id: 'a0', label: 'เสียง 1 FLAC' }];");
  await over(p, "bitrate_start", "const r = await window.__fxOverBase.bitrate_start(a); return { ...r, kind: 'audio', track: 'a0', tracks: [{ id: 'a0', label: 'เสียง 1 FLAC' }], codec: 'flac', channels: 2, sample_rate: 44100, video: 0, audio: 1, layout: 'stereo' };");
  await nav(p, "บิตเรต"); await wait(p, 300); await avDrop(p, SONG);
  await p.waitForSelector("[data-brnplot]", { timeout: 15000 }); await wait(p, 1500);
};
T[6] = async (p, check) => {
  await p.evaluate(() => { localStorage.removeItem("br-wave-fold"); localStorage.removeItem("br-ov-fold"); });
  await brAudio(p);
  await p.waitForSelector("[data-brnwavecv=ready]", { timeout: 8000 }).catch(() => {});
  const w = await p.evaluate(() => { const wv = document.querySelector("[data-brnwave] .brn-wave"), pl = document.querySelector("[data-brnplot]"), ov = document.querySelector(".brn-ov"); if (!wv || !pl) return null; const a = wv.getBoundingClientRect(), b = pl.getBoundingClientRect(), o = ov.getBoundingClientRect(); return { wl: a.left, ww: a.width, pl: b.left, pw: b.width, below: a.top >= o.bottom - 1, above: a.bottom <= b.top + 1, ready: document.querySelector("[data-brnwavecv]").dataset.brnwavecv }; });
  check("163.6 ไฟล์เสียงขึ้นรูปคลื่นเสียงใต้แถบภาพรวม เหนือกราฟบิตเรต ขอบซ้ายและความกว้างตรงกับกราฟบิตเรต", !!w && w.ready === "ready" && w.below && w.above && Math.abs(w.wl - w.pl) < 1 && Math.abs(w.ww - w.pw) < 1, JSON.stringify(w));
  // มีคลื่นจริงในพื้นที่กราฟ (จุดสีจุดเน้นเยอะพอ)
  const ink = await p.evaluate(() => { const c = document.querySelector("[data-brnwavecv]"), g = c.getContext("2d"), d = g.getImageData(Math.round(c.width * 0.3), 0, Math.round(c.width * 0.4), c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i] < 200) n++; return n; });
  check("163.6 รูปคลื่นวาดคลื่นจริงในพื้นที่กราฟ", ink > 500, String(ink));
  if (process.env.SHOTS) { await p.screenshot({ path: `${process.env.SHOTS}/บิตเรต-รูปคลื่น.png` }); }
  // ชี้ในกราฟบิตเรต ขีดในรูปคลื่นขึ้นตรงตำแหน่งเดียวกัน
  const pb = await p.evaluate(() => { const r = document.querySelector("[data-brnplot]").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await p.mouse.move(pb.x + pb.w * 0.5, pb.y + pb.h * 0.5); await wait(p, 200);
  const xh = await p.evaluate(() => { const l = document.querySelector("[data-brnwavexh]"), wv = document.querySelector("[data-brnwave] .brn-wave"); return l ? l.getBoundingClientRect().left - wv.getBoundingClientRect().left : null; });
  check("163.6 ชี้ในกราฟบิตเรตแล้วขีดในรูปคลื่นตรงตำแหน่งเดียวกัน", xh != null && Math.abs(xh - pb.w * 0.5) < 2, JSON.stringify({ xh, want: pb.w * 0.5 }));
  // ชี้ในรูปคลื่น กราฟบิตเรตขึ้นกล่องบอกค่าของเวลานั้น
  const wb = await p.evaluate(() => { const r = document.querySelector("[data-brnwave] .brn-wave").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  await p.mouse.move(wb.x + wb.w * 0.4, wb.y + wb.h / 2); await wait(p, 200);
  const tip = await p.evaluate(() => !!document.querySelector("[data-brntip]"));
  check("163.6 ชี้ในรูปคลื่นแล้วกราฟบิตเรตขึ้นกล่องบอกค่าของเวลาเดียวกัน", tip, "");
  // ซูมกราฟบิตเรต รูปคลื่นตามช่วงเดียวกัน (ซูมเข้าแล้วภาพเปลี่ยน)
  const before = await p.evaluate(() => document.querySelector("[data-brnwavecv]").toDataURL().length);
  await click(p, "[data-brnzoomin]"); await wait(p, 600);
  const after = await p.evaluate(() => document.querySelector("[data-brnwavecv]").toDataURL().length);
  check("163.6 ซูมกราฟบิตเรตแล้วรูปคลื่นเปลี่ยนตามช่วงที่ซูม", before !== after, JSON.stringify({ before, after }));
  // พับรูปคลื่นกับพับภาพรวมได้แยกกัน จำไว้
  await click(p, "[data-brnwavefold]"); await wait(p, 200);
  const f1 = await p.evaluate(() => ({ wave: !!document.querySelector("[data-brnwave]"), ov: !document.querySelector(".brn-ov").hidden, saved: localStorage.getItem("br-wave-fold") }));
  await click(p, "[data-brnovfold]"); await wait(p, 200);
  const f2 = await p.evaluate(() => ({ ov: !document.querySelector(".brn-ov").hidden, saved: localStorage.getItem("br-ov-fold") }));
  check("163.6 พับรูปคลื่นแล้วภาพรวมยังอยู่ พับภาพรวมได้แยก และจำไว้ทั้งคู่", !f1.wave && f1.ov && f1.saved === "1" && !f2.ov && f2.saved === "1", JSON.stringify({ f1, f2 }));
  await click(p, "[data-brnwavefold]"); await click(p, "[data-brnovfold]"); await wait(p, 300);
  const f3 = await p.evaluate(() => ({ wave: !!document.querySelector("[data-brnwave]"), ov: !document.querySelector(".brn-ov").hidden }));
  check("163.6 กางคืนได้ทั้งสองแถบ", f3.wave && f3.ov, JSON.stringify(f3));
  await p.evaluate(() => { localStorage.removeItem("br-wave-fold"); localStorage.removeItem("br-ov-fold"); });
  // ไฟล์วิดีโอไม่ขึ้นรูปคลื่น
  await p.evaluate(() => { window.__fxOver = {}; });
  await nav(p, "ชั้นวางหนัง"); await wait(p, 200); await nav(p, "บิตเรต"); await wait(p, 300); await avDrop(p, MOVIE);
  await wait(p, 2500);
  const v = await p.evaluate(() => ({ wave: !!document.querySelector("[data-brnwave]"), btn: !!document.querySelector("[data-brnwavefold]"), plot: !!document.querySelector("[data-brnplot]") }));
  check("163.6 ไฟล์วิดีโอไม่ขึ้นรูปคลื่น และไม่มีปุ่มพับรูปคลื่น", v.plot && !v.wave && !v.btn, JSON.stringify(v));
};

// ---------------------------------------------------------------- ตัวรัน
const want = process.argv.slice(2).map(Number).filter(Boolean);
const ids = Object.keys(T).map(Number).filter((n) => !want.length || want.includes(n)).sort((a, b) => a - b);
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : `  →  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`); };
let vite = null;
if (!(await up())) {
  vite = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "--port", "1420", "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}
const { chromium } = createRequire(import.meta.url)("playwright");
// เสียงในระบบจำลองเล่นได้โดยไม่ต้องมีคนกดก่อน (นโยบายเล่นเสียงอัตโนมัติของเบราว์เซอร์)
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  for (const n of ids) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(URL); await p.waitForSelector("[data-navbar]"); await wait(p, 1500);
    // ตัวเดิมของคำสั่งที่สลับ เรียกจากตัวสลับได้ (window.__fxOverBase)
    await p.evaluate(() => { window.__fxOverBase = new Proxy({}, { get: (_, c) => (a) => { const o = window.__fxOver; window.__fxOver = undefined; const r = window.__TAURI_INTERNALS__.invoke(c, a); window.__fxOver = o; return r; } }); });
    try { await T[n](p, check); } catch (e) { check(`${n} ตรวจจบไม่ได้`, false, e.message.split("\n")[0]); }
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/ข้อ-${n}.png` }).catch(() => {});
    if (errs.length) check(`${n} ไม่มีข้อผิดพลาดในหน้า`, false, errs.join(" | "));
    await p.close();
  }
} finally { await b.close(); vite?.kill(); }
console.log(`\nผ่าน ${pass} ตก ${fail}`);
process.exit(fail ? 1 : 0);
