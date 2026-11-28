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

/** 163.8 กับ 164.1 โทนเทล (teal) และโทนฟ้าน้ำทะเล (ocean) เป็นคนละโทน */
T[8] = async (p, check) => {
  const hue = (rgb) => { const [r, g, b] = rgb.match(/\d+/g).map(Number).map((v) => v / 255); const a = Math.max(r, g, b), z = Math.min(r, g, b), d = a - z; if (!d) return -1; return (a === r ? ((g - b) / d + 6) % 6 : a === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60; };
  const T2 = await p.evaluate(async () => { const m = await import("/src/lib/tones.ts"); return ["teal", "ocean"].map((id) => { const x = m.TONES.find((q) => q.id === id); return x ? { id, name: x.name, con: m.minContrast(x), dark: !!x.dark, accent: x.v.accent } : null; }); });
  check("164.1 มีโทนเทลกับโทนฟ้าน้ำทะเลแยกกัน ชื่อตรง ผ่านเกณฑ์ 4.5 ทั้งคู่", T2.every(Boolean) && T2[0].name === "เทล" && T2[1].name === "ฟ้าน้ำทะเล" && T2.every((t) => t.con >= 4.5 && !t.dark) && T2[0].accent !== T2[1].accent, JSON.stringify(T2));
  for (const [id, lo, hi, acc] of [["teal", 160, 192, "#1d7472"], ["ocean", 192, 215, "#1f6a96"]]) {
    await p.evaluate((x) => window.__applyTone(x), id); await wait(p, 400);
    const c = await p.evaluate(() => { const btn = [...document.querySelectorAll(".btn-main")].find((e) => e.getBoundingClientRect().width); const nav = document.querySelector(".side .nav.on"); return { accent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(), btn: btn ? getComputedStyle(btn).backgroundColor : "", nav: nav ? getComputedStyle(nav).backgroundColor : "" }; });
    const hb = hue(c.btn), hn = hue(c.nav);
    check(`164.1 เลือกโทน ${id} แล้ว --accent เป็น ${acc} ปุ่มหลักกับเมนูที่เลือกหมุนเป็นสีของโทน (hue ${lo} ถึง ${hi})`, c.accent.toLowerCase() === acc && hb >= lo && hb <= hi && hn >= lo && hn <= hi, JSON.stringify({ ...c, hb, hn }));
  }
  await nav(p, "ตั้งค่า"); await wait(p, 500);
  await p.evaluate(() => [...document.querySelectorAll("button,a,li")].filter((x) => !x.closest("[data-navbar]")).find((x) => x.textContent.trim() === "โทนสี")?.click()); await wait(p, 500);
  const n = await p.evaluate(() => [...document.querySelectorAll(".tncard")].map((e) => e.innerText.split("\n")[0].trim()));
  check("164.1 หน้าตั้งค่าหัวข้อโทนสีมีการ์ดเทลกับฟ้าน้ำทะเลเป็นการ์ดที่หกและเจ็ด", n.length === 7 && n[5].startsWith("เทล") && n[6].startsWith("ฟ้าน้ำทะเล"), JSON.stringify(n));
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

/** 163.7 (เลข 46) เมนูคลิกขวาของโปรแกรม คลิกขวาที่หนังบนชั้นวางแล้วทำได้ทุกอย่างของเรื่องนั้น */
const PANEL = ["เปิดเล่น", "เปลี่ยนชื่อ", "เปลี่ยนโปสเตอร์", "ตรวจไฟล์", "MediaInfo", "เปิดโฟลเดอร์", "จับคู่รูปปก", "กราฟเสียง", "เสียงและซับ", "Bitrate"];
const menuState = (p) => p.evaluate(() => { const m = document.querySelector("[data-moviemenu]"); if (!m) return null; const r = m.getBoundingClientRect();
  return { name: m.dataset.moviemenu, items: [...m.querySelectorAll("[data-mm]")].map((b) => b.querySelector(".mm-lbl").textContent), off: [...m.querySelectorAll("[data-mm].off")].map((b) => b.dataset.mm), stars: m.querySelector("[data-mmstars]")?.dataset.mmstars, focus: document.activeElement?.dataset?.mm ?? null, r: { l: r.left, t: r.top, rr: r.right, b: r.bottom }, W: innerWidth, H: innerHeight }; });
T[7] = async (p, check) => {
  await nav(p, "ชั้นวางหนัง"); await wait(p, 500);
  // คลิกขวาที่ปกเรื่องแรก
  const first = await p.evaluate(() => { const b = document.querySelector(".book[data-mid]"); const r = b.getBoundingClientRect(); return { id: b.dataset.mid, name: b.dataset.movie, x: r.left + r.width / 2, y: r.top + 40 }; });
  await p.mouse.click(first.x, first.y, { button: "right" }); await wait(p, 300);
  const a = await menuState(p);
  // แผงขวาของเรื่องนั้นเปิด ปุ่มในแผงเรียงแบบเดียวกับเมนู
  const panel = await p.evaluate(() => [...document.querySelectorAll(".detail .actions .btn")].map((b) => b.innerText.trim()));
  check("163.7 คลิกขวาที่ปกขึ้นเมนูของเรื่องนั้น และเลือกเรื่องนั้นให้แผงขวาเปิด", !!a && a.name === first.name && panel.length > 0, JSON.stringify({ a, first }));
  const sameAsPanel = panel.every((t) => a.items.includes(t)) && JSON.stringify(a.items.filter((t) => PANEL.includes(t))) === JSON.stringify(panel.filter((t) => PANEL.includes(t)));
  check("163.7 ส่วนแรกของเมนูเป็นปุ่มชุดเดียวกับแผงขวา ชื่อและลำดับเดียวกัน", sameAsPanel, JSON.stringify({ menu: a.items, panel }));
  check("163.7 ใต้เส้นคั่นมีให้ดาว คัดลอกที่อยู่ไฟล์ คัดลอกชื่อเรื่อง", a.items.includes("คัดลอกที่อยู่ไฟล์") && a.items.includes("คัดลอกชื่อเรื่อง") && a.stars != null, JSON.stringify(a.items));
  check("163.7 เมนูอยู่ในจอทั้งหมด และโฟกัสอยู่ที่ข้อแรก (เปิดเล่น)", a.r.l >= 0 && a.r.t >= 0 && a.r.rr <= a.W && a.r.b <= a.H && a.focus === "play", JSON.stringify(a));
  // ลูกศรลงเลื่อนข้อ Esc ปิด
  await p.keyboard.press("ArrowDown"); await wait(p, 80);
  const f2 = await p.evaluate(() => document.activeElement?.dataset?.mm);
  await p.keyboard.press("Escape"); await wait(p, 200);
  check("163.7 ลูกศรลงเลื่อนไปข้อถัดไป (เปิดเล่นด้วยโปรแกรมอื่น ข้อ 164.5) Esc ปิดเมนู", f2 === "playWith" && !(await menuState(p)), String(f2));
  // คลิกขวาชิดขอบขวาล่าง เมนูกางกลับทางไม่ล้นจอ (ปิดแผงขวาก่อน ปกแถวบนชิดขอบขวาของหน้าต่าง)
  await click(p, "[data-detailclose]"); await wait(p, 300);
  const last = await p.evaluate(() => { const bs = [...document.querySelectorAll(".book[data-mid]")].filter((b) => { const r = b.getBoundingClientRect(); return r.bottom < innerHeight - 40 && r.width > 0; }); const b = bs[bs.length - 1]; const r = b.getBoundingClientRect(); return { x: Math.min(innerWidth - 12, r.right - 4), y: Math.min(innerHeight - 40, r.bottom - 4) }; });
  await p.mouse.click(last.x, last.y, { button: "right" }); await wait(p, 300);
  const e = await menuState(p);
  check("163.7 คลิกขวาใกล้ขอบขวาล่าง เมนูกางไปทางซ้ายและขึ้นบน ไม่ล้นจอ", !!e && e.r.rr <= e.W && e.r.b <= e.H && e.r.rr <= last.x + 1, JSON.stringify({ e, last }));
  // กดข้างนอกปิด
  await p.mouse.click(5, 300); await wait(p, 200);
  check("163.7 กดข้างนอกเมนูแล้วปิด", !(await menuState(p)), "");
  // ข้อทำงานจริง คัดลอกที่อยู่ไฟล์ลงที่เก็บของตัวตรวจ ไม่แตะคลิปบอร์ด
  await p.evaluate(() => { window.__shelfClipOut = []; });
  await p.mouse.click(first.x, first.y, { button: "right" }); await wait(p, 250);
  await click(p, "[data-mm=copyPath]"); await wait(p, 200);
  await p.mouse.click(first.x, first.y, { button: "right" }); await wait(p, 250);
  await click(p, "[data-mm=copyName]"); await wait(p, 200);
  const clip = await p.evaluate(() => window.__shelfClipOut);
  check("163.7 คัดลอกที่อยู่ไฟล์กับชื่อเรื่องได้ค่าของเรื่องที่คลิกขวา", clip.length === 2 && /^D:\\.*\.mkv$/.test(clip[0]) && clip[1] === first.name, JSON.stringify(clip));
  // ให้ดาวจากเมนู เรียกคำสั่งให้คะแนนของเรื่องนั้น
  await p.evaluate(() => { window.__rated = null; const AF = Object.getPrototypeOf(async function () {}).constructor; (window.__fxOver ??= {}).set_rating = new AF("a", "window.__rated = a; return await window.__fxOverBase.set_rating(a);"); });
  await p.mouse.click(first.x, first.y, { button: "right" }); await wait(p, 250);
  await click(p, "[data-mmstar='4']"); await wait(p, 200);
  const rated = await p.evaluate(() => window.__rated);
  check("163.7 ให้ดาวจากเมนู ส่งคะแนน 4 ดาวของเรื่องนั้น", !!rated && rated.id === first.id && rated.stars === 4, JSON.stringify(rated));
  // เปลี่ยนชื่อจากเมนู เปิดช่องเปลี่ยนชื่อในแผงขวา
  await p.mouse.click(first.x, first.y, { button: "right" }); await wait(p, 250);
  await click(p, "[data-mm=rename]"); await wait(p, 300);
  const ren = await p.evaluate(() => !!document.querySelector(".detail input"));
  check("163.7 เปลี่ยนชื่อจากเมนู เปิดช่องเปลี่ยนชื่อในแผงขวาของเรื่องนั้น", ren, "");
  await p.keyboard.press("Escape"); await wait(p, 200);
  // ไปหน้าอื่นจากเมนู กราฟเสียงพาไปหน้ากราฟพร้อมไฟล์นี้
  await p.mouse.click(first.x, first.y, { button: "right" }); await wait(p, 250);
  await click(p, "[data-mm=graph]"); await wait(p, 800);
  const g = await p.evaluate(() => ({ graph: !!document.querySelector("[data-graph]"), page: [...document.querySelectorAll("[data-navbar] button")].find((b) => b.getAttribute("aria-current") === "page" || b.classList.contains("on"))?.innerText.trim() }));
  check("163.7 กราฟเสียงจากเมนู พาไปหน้ากราฟเสียง", g.graph, JSON.stringify(g));
  // แบบตาราง คลิกขวาที่แถวได้เมนูเดียวกัน
  await nav(p, "ชั้นวางหนัง"); await wait(p, 300);
  await clickText(p, "ตาราง"); await wait(p, 500);
  const row = await p.evaluate(() => { const r = document.querySelector("tr[data-mid]").getBoundingClientRect(); return { x: r.left + 200, y: r.top + r.height / 2 }; });
  await p.mouse.click(row.x, row.y, { button: "right" }); await wait(p, 300);
  const t = await menuState(p);
  check("163.7 แบบตาราง คลิกขวาที่แถวขึ้นเมนูเดียวกัน", !!t && t.items[0] === "เปิดเล่น" && t.items.includes("Bitrate"), JSON.stringify(t?.items));
  await p.keyboard.press("Escape");
  await clickText(p, "ภาพปก"); await wait(p, 300);
  // คลิกขวาที่ที่ว่างของชั้นวาง ไม่มีเมนูของโปรแกรม
  await p.mouse.click(700, 140, { button: "right" }); await wait(p, 200);
  check("163.7 คลิกขวาที่ไม่ใช่หนัง ไม่ขึ้นเมนูของหนัง", !(await menuState(p)), "");
};

/** 164.6 แถวล่างหน้ารูปคลื่น คำว่า จุดเสีย ไม่ทับกับ ขยายแนวตั้ง ทุกขนาดหน้าต่าง แถวไม่ล้นขวา */
T[96] = async (p, check) => {
  for (const [W, H] of [[1280, 800], [1600, 852], [1920, 1032]]) {
    await p.setViewportSize({ width: W, height: H });
    await graphOpen(p, MOVIE); await p.click("[data-view=wave]").catch(() => {}); await wait(p, 500);
    const r = await p.evaluate(() => { const f = document.querySelector(".agfoot"); const kids = [...f.querySelectorAll(".lgrow > *, .agfoot > div:last-child > *")].map((e) => { const r = e.getBoundingClientRect(); return { t: (e.innerText || e.className).slice(0, 14), l: r.left, r: r.right, top: r.top, b: r.bottom }; }).filter((x) => x.r > x.l);
      const ov = []; for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) { const a = kids[i], c = kids[j]; if (a.l < c.r - 1 && c.l < a.r - 1 && a.top < c.b - 1 && c.top < a.b - 1) ov.push(a.t + " × " + c.t); }
      const t = document.querySelector(".vzlbl-t"); return { ov, over: f.scrollWidth - f.clientWidth, mark: !!document.querySelector(".lgrow")?.innerText.includes("จุดเสีย"), word: t ? getComputedStyle(t).display !== "none" : null, title: document.querySelector(".vzlbl")?.title }; });
    check(`164.6 หน้าต่าง ${W} × ${H} แถวล่างรูปคลื่นมีจุดเสีย ไม่มีชิ้นทับกัน แถวไม่ล้นขวา`, r.mark && r.ov.length === 0 && r.over <= 0, JSON.stringify(r));
    if (W === 1280) check("164.6 หน้าต่าง 1280 คำว่า ขยายแนวตั้ง เหลือไอคอนที่ชี้แล้วบอกชื่อ", r.word === false && r.title === "ขยายแนวตั้ง", JSON.stringify(r));
    else check(`164.6 หน้าต่าง ${W} ยังเขียนคำว่า ขยายแนวตั้ง เต็ม`, r.word === true, JSON.stringify(r));
    await nav(p, "ชั้นวางหนัง"); await wait(p, 200);
  }
  await p.setViewportSize({ width: 1280, height: 800 });
};

/** 164.2 (เลข 32) ร่องรอยตัวเข้ารหัส กับปุ่มตรวจ FLAC ด้วย MD5 */
T[92] = async (p, check) => {
  await graphOpen(p, SONG); await wait(p, 600);
  const c = await p.evaluate(() => { const k = document.querySelector("[data-enccard]"); return k ? { rows: [...k.querySelectorAll("[data-encrows] dt")].map((d) => d.textContent), txt: k.innerText, md5Full: k.querySelector("[data-encrows] dd[title]")?.title, btn: !!k.querySelector("[data-flaccheck]"), tip: !!k.querySelector("[data-info='ร่องรอยตัวเข้ารหัส']") } : null; });
  check("164.2 ไฟล์ FLAC ขึ้นการ์ดร่องรอยตัวเข้ารหัส ตัวเข้ารหัส สรุป MD5 ของเสียง มีปุ่ม ⓘ กับปุ่มตรวจ MD5", !!c && c.rows.join() === "ตัวเข้ารหัส,สรุป,MD5 ของเสียง" && c.txt.includes("libFLAC") && c.md5Full === "0a1b2c3d4e5f60718293a4b5c6d7e8f9" && c.btn && c.tip, JSON.stringify(c));
  const codecTip = await p.evaluate(() => !!document.querySelector("[data-graphinfo] [data-info='ชื่อตัวเข้ารหัสในวงเล็บ']"));
  check("164.2 แถว Codec มีปุ่ม ⓘ บอกว่าชื่อตัวเข้ารหัสเป็นเบาะแส", codecTip, "");
  await click(p, '[data-info="ร่องรอยตัวเข้ารหัส"]'); await p.waitForSelector('[data-tip="ร่องรอยตัวเข้ารหัส"]'); await wait(p, 300);
  const lines = await linesOf((code) => p.evaluate(`(async () => { ${code} })()`), '[data-tip="ร่องรอยตัวเข้ารหัส"]');
  if (process.env.DUMP) console.log(JSON.stringify(lines, null, 1));
  const want = [
    "ชื่อโปรแกรมที่เข้ารหัสเสียงไฟล์นี้ ซึ่งตัวเข้ารหัสฝากไว้ในไฟล์",
    "เป็นเบาะแส ข้อความนี้อยู่ในส่วนแท็กซึ่งโปรแกรมแก้แท็กเขียนทับได้ ⏎ จึงไม่ใช่หลักฐานเด็ดขาด ต้องดูคู่กับกราฟความถี่",
    "MP3 LAME จดโหมดไว้ เช่น VBR ระดับ V0 หรือ CBR 320 kbps ⏎ ส่วน MP3 ที่ไม่มีข้อความของ LAME มักมาจากตัวเข้ารหัสอื่น",
    "AAC แยกได้ว่ามาจาก qaac หรือ iTunes ซึ่งใช้เอนจินของ Apple ⏎ หรือจากตัวเข้ารหัสในตัวของ ffmpeg ซึ่งคุณภาพต่างกันจริง",
    "FLAC หัวไฟล์ฝัง MD5 ของเสียงไว้ กดตรวจแล้วถอดเสียงมาเทียบ ⏎ ตรงกันแปลว่าเสียงไม่เสียแม้แต่บิตเดียว แม้แท็กหรือปกจะเปลี่ยน",
  ];
  check("164.2 กล่อง ⓘ ร่องรอยตัวเข้ารหัส แยกหัวข้อละเรื่อง ตัดบรรทัดตรงความหมาย", JSON.stringify(lines) === JSON.stringify(want), JSON.stringify(lines));
  await p.keyboard.press("Escape"); await wait(p, 200);
  // กดตรวจ ระหว่างตรวจปุ่มบอกกำลังตรวจและกดซ้ำไม่ได้ แล้วขึ้นผลสีเขียว
  await click(p, "[data-flaccheck]"); await wait(p, 150);
  const busy = await p.evaluate(() => { const b = document.querySelector("[data-flaccheck]"); return { t: b.innerText.trim(), off: b.getAttribute("aria-disabled") }; });
  await p.waitForSelector("[data-flacres]", { timeout: 5000 });
  const res = await p.evaluate(() => { const r = document.querySelector("[data-flacres]"); return { st: r.dataset.flacres, cls: r.className, txt: r.innerText }; });
  check("164.2 กดตรวจ ปุ่มบอกกำลังตรวจและกดซ้ำไม่ได้ จบแล้วขึ้นผลว่าเสียงตรงกับ MD5", busy.t.includes("กำลังตรวจ") && busy.off === "true" && res.st === "ok" && res.cls.includes("ok") && res.txt.includes("ทุกบิต") && res.txt.includes("ใช้เวลา"), JSON.stringify({ busy, res }));
  // ไฟล์ที่หัวไฟล์ไม่มี MD5 ขึ้นเหลือง ห้ามบอกว่าผ่าน
  await over(p, "flac_verify", "return { status: 'nomd5', detail: 'หัวไฟล์ไม่ได้ฝัง MD5 ไว้ ส่วนการถอดเสียงทั้งไฟล์ผ่าน', secs: 1 };");
  await click(p, "[data-flaccheck]"); await p.waitForFunction(() => document.querySelector("[data-flacres]")?.dataset.flacres === "nomd5", null, { timeout: 5000 });
  const nm = await p.evaluate(() => { const r = document.querySelector("[data-flacres]"); return { cls: r.className, txt: r.innerText }; });
  check("164.2 ไม่มี MD5 ขึ้นสีเตือนว่าตรวจไม่ได้ ไม่บอกว่าผ่าน", nm.cls.includes("warn") && nm.txt.includes("ตรวจไม่ได้") && !nm.txt.includes("ทุกบิต"), JSON.stringify(nm));
  await over(p, "flac_verify", "return { status: 'bad', detail: 'MD5 ของเสียงไม่ตรงกับที่ฝังไว้', secs: 1 };");
  await click(p, "[data-flaccheck]"); await p.waitForFunction(() => document.querySelector("[data-flacres]")?.dataset.flacres === "bad", null, { timeout: 5000 });
  const bd = await p.evaluate(() => document.querySelector("[data-flacres]").className);
  check("164.2 MD5 ไม่ตรง ขึ้นสีแดง", bd.includes("bad"), bd);
  // ไฟล์หนัง (เสียงไม่มีชื่อตัวเข้ารหัส ไม่ใช่ FLAC) ไม่มีการ์ด
  await nav(p, "ชั้นวางหนัง"); await wait(p, 200);
  await graphOpen(p, MOVIE); await wait(p, 600);
  check("164.2 แทร็กที่ไม่มีร่องรอยและไม่ใช่ FLAC ไม่ขึ้นการ์ด", !(await p.evaluate(() => !!document.querySelector("[data-enccard]"))), "");
};

/** 164.3 (ROADMAP ข้อ 35.6) เลือกตัวถอดเสียงได้ และหัวข้อการเล่นเสียงในหน้าตั้งค่า */
const playSec = async (p) => {
  await nav(p, "ตั้งค่า"); await wait(p, 400);
  await p.evaluate(() => [...document.querySelectorAll("button,a,li")].filter((x) => !x.closest("[data-navbar]")).find((x) => x.textContent.trim() === "การเล่นเสียง")?.click()); await wait(p, 400);
};
T[93] = async (p, check) => {
  await p.evaluate(() => { localStorage.removeItem("ms.playPrefs"); localStorage.removeItem("ms.graphVol"); localStorage.removeItem("ms.graphLoop"); });
  await playSec(p);
  const rows = await p.evaluate(() => { const c = document.querySelector("[data-setcard=playback]"); if (!c || c.hidden) return null; return { dec: [...c.querySelectorAll("[data-play-dec]")].map((r) => r.dataset.playDec), other: c.querySelector("[data-play-dec=other] .seg")?.classList.contains("seg-off"), lbls: [...c.querySelectorAll(".setrow > .lbl")].map((l) => [...l.childNodes].find((n) => n.nodeType === 3)?.textContent.trim()), reset: c.querySelector("[data-play-reset]")?.getAttribute("aria-disabled") }; });
  check("164.3 หัวข้อการเล่นเสียงมีตัวถอดห้าชนิด ชนิดอื่นใช้ ffmpeg อย่างเดียวพร้อมเหตุผล และปุ่มกลับค่าตั้งต้นกดไม่ได้ตอนเป็นค่าตั้งต้น", !!rows && rows.dec.join() === "flac,ape,tak,mp3,wv,other" && rows.other && rows.reset === "true", JSON.stringify(rows));
  const want = ["ความดังลำโพง", "เล่นวน", "กราฟเลื่อนตามขีดตำแหน่งเล่น", "กดปุ่มหยุดแล้ว", "ออกจากหน้ากราฟแล้ว", "คีย์ลัดของการเล่น", "แสดงแถบวัดระดับเสียง", "ขีดค้างยอด", "ช่วงที่แสดง"];
  check("164.3 หัวข้อการเล่นเสียงมีครบทุกแง่มุม ความดัง เล่นวน กราฟเลื่อนตาม ปุ่มหยุด ออกจากหน้า คีย์ลัด แถบวัดระดับ", want.every((w) => rows.lbls.includes(w)), JSON.stringify(rows.lbls));
  // กล่อง ⓘ ตัวถอดเสียง ตัดบรรทัดตรงความหมาย
  await click(p, '[data-info="ตัวถอดเสียง"]'); await p.waitForSelector('[data-tip="ตัวถอดเสียง"]'); await wait(p, 300);
  const lines = await linesOf((code) => p.evaluate(`(async () => { ${code} })()`), '[data-tip="ตัวถอดเสียง"]');
  if (process.env.DUMP) console.log(JSON.stringify(lines, null, 1));
  const tipWant = [
    "โปรแกรมที่แปลงไฟล์เสียงกลับเป็นเสียงดิบเพื่อเล่นในหน้ากราฟ ⏎ ไม่ได้แก้ไฟล์ และเสียงที่ได้ยินเหมือนกันทุกตัวถอด",
    "ffmpeg ถอดได้ทุกชนิดและข้ามไปกลางไฟล์ได้ทันที จึงเป็นค่าตั้งต้น",
    "ตัวถอดของ codec เช่น flac.exe ไว้ลองเทียบเมื่อสงสัยว่าอ่านผิด ⏎ ใช้ได้เฉพาะไฟล์ชนิดนั้น ส่วนเสียงในไฟล์หนังใช้ ffmpeg",
    "Takc กับ lame ข้ามไปกลางไฟล์ไม่ได้ จึงต้องถอดทั้งไฟล์ก่อนเล่น ⏎ ไฟล์ยาวจึงรอนานขึ้น แล้วเก็บไว้เล่นซ้ำจนปิดโปรแกรม",
    "ถอดไม่ได้ โปรแกรมกลับไปใช้ ffmpeg แล้วบอกในแถบเล่น",
  ];
  check("164.3 กล่อง ⓘ ตัวถอดเสียงแยกหัวข้อ ตัดบรรทัดตรงความหมาย", JSON.stringify(lines) === JSON.stringify(tipWant), JSON.stringify(lines));
  await p.keyboard.press("Escape"); await wait(p, 200);
  // เลือก flac.exe สำหรับ FLAC แล้วหน้ากราฟส่งตัวถอดนี้ไปฝั่ง Rust
  await p.evaluate(() => [...document.querySelectorAll("[data-play-dec=flac] button")].find((b) => b.textContent === "flac.exe").click()); await wait(p, 200);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("ms.playPrefs") ?? "{}").dec?.flac);
  await over(p, "graph_pcm", "(window.__decs ??= []).push(a.decoder); return await window.__fxOverBase.graph_pcm(a);");
  await graphOpen(p, SONG); await p.click("[data-gplay]"); await wait(p, 900);
  const d1 = await p.evaluate(() => ({ decs: [...new Set(window.__decs)], st: window.__graphPlay() }));
  check("164.3 เลือก flac.exe แล้วเล่นไฟล์ .flac ส่งตัวถอด flac ไปฝั่ง Rust", saved === "flac" && d1.decs.join() === "flac" && d1.st.playing && d1.st.dec === "flac.exe", JSON.stringify({ saved, d1 }));
  await click(p, "[data-gpstop]"); await wait(p, 200);
  // ตัวถอดที่เลือกถอดไม่ได้ กลับไปใช้ ffmpeg แล้วบอกในแถบเล่น
  await over(p, "graph_pcm", "(window.__decs2 ??= []).push(a.decoder); if (a.decoder !== 'ffmpeg') throw 'DECODER: flac ถอดไม่ได้  ERROR ทดสอบ'; return await window.__fxOverBase.graph_pcm(a);");
  await p.click("[data-gplay]"); await wait(p, 900);
  const d2 = await p.evaluate(() => ({ decs: window.__decs2, st: window.__graphPlay(), note: document.querySelector("[data-gpnote]")?.textContent, why: document.querySelector("[data-gpnote]")?.title }));
  check("164.3 ตัวถอดที่เลือกถอดไม่ได้ กลับไปใช้ ffmpeg เล่นต่อได้ และแถบเล่นบอกสั้น ๆ คำเต็มอยู่ตอนชี้", d2.st.playing && d2.decs[0] === "flac" && d2.decs.includes("ffmpeg") && d2.note === "flac.exe ถอดไม่ได้ ใช้ ffmpeg แทน" && (d2.why ?? "").includes("ERROR ทดสอบ"), JSON.stringify(d2));
  await click(p, "[data-gpstop]"); await wait(p, 200);
  await p.evaluate(() => { window.__fxOver = {}; });
  // ปุ่มหยุดค้างที่จุดที่หยุด
  await p.evaluate(async () => (await import("/src/lib/playPrefs.ts")).setPlayPrefs({ stopBack: false }));
  await click(p, "[data-gphome]"); await p.click("[data-gplay]"); await wait(p, 1500);
  await click(p, "[data-gpstop]"); await wait(p, 250);
  const stay = await p.evaluate(() => document.querySelector("[data-gptime] span")?.textContent);
  check("164.3 ตั้งปุ่มหยุดให้ค้างที่จุดที่หยุด กดหยุดแล้วเวลาไม่กลับไปศูนย์", !/^0:00\.000/.test(stay ?? "") && /^0:0[1-3]\./.test(stay ?? ""), String(stay));
  // ปิดแถบวัดระดับ ตอนเล่นไม่มีแถบวัด
  await p.evaluate(async () => (await import("/src/lib/playPrefs.ts")).setPlayPrefs({ meter: false }));
  await p.click("[data-gplay]"); await wait(p, 600);
  const m = await p.evaluate(() => document.querySelectorAll("[data-meter]").length);
  check("164.3 ปิดแถบวัดระดับเสียงแล้ว ตอนเล่นไม่มีแถบวัด", m === 0, String(m));
  // ออกจากหน้ากราฟแล้วเล่นต่อ
  await p.evaluate(async () => (await import("/src/lib/playPrefs.ts")).setPlayPrefs({ stopOnLeave: false }));
  await nav(p, "ชั้นวางหนัง"); await wait(p, 500);
  const keep = await p.evaluate(() => window.__graphPlay().playing);
  check("164.3 ตั้งให้เล่นต่อ ออกจากหน้ากราฟแล้วเสียงยังเล่นอยู่", keep, "");
  await nav(p, "กราฟเสียง"); await wait(p, 300); await click(p, "[data-gpstop]");
  // กลับค่าตั้งต้น
  await playSec(p);
  await click(p, "[data-play-reset]"); await wait(p, 200);
  const r = await p.evaluate(() => ({ saved: localStorage.getItem("ms.playPrefs"), seg: [...document.querySelectorAll("[data-play-dec=flac] button")].find((b) => b.classList.contains("on"))?.textContent, dis: document.querySelector("[data-play-reset]").getAttribute("aria-disabled") }));
  check("164.3 กลับค่าตั้งต้น ตัวถอดกลับเป็น ffmpeg และปุ่มกลับเป็นกดไม่ได้", r.saved == null && r.seg === "ffmpeg" && r.dis === "true", JSON.stringify(r));
  // ปุ่มไปหัวข้อคีย์ลัด
  await click(p, "[data-play-keys]"); await wait(p, 300);
  check("164.3 ปุ่มคีย์ลัดของการเล่นพาไปหัวข้อคีย์ลัด", await p.evaluate(() => !document.querySelector("[data-setcard=hotkeys]")?.hidden || !!document.querySelector("[data-hk-group]")), "");
};

/** 164.5 (ROADMAP ข้อ 39) เมนูคลิกขวาทุกจุดที่ควรมี กับหัวข้อเมนูคลิกขวาในหน้าตั้งค่า */
const ctxState = (p) => p.evaluate(() => { const m = document.querySelector("[data-ctxmenu]"); return m ? { menu: m.dataset.ctxmenu, items: [...m.querySelectorAll("[data-mm]")].map((b) => b.dataset.mm), off: [...m.querySelectorAll("[data-mm].off")].map((b) => b.dataset.mm) } : null; });
const snap = (p, name) => process.env.SHOTS ? p.screenshot({ path: `${process.env.SHOTS}/${name}.png` }).catch(() => {}) : null;
T[95] = async (p, check) => {
  await p.evaluate(() => { localStorage.removeItem("ms.ctxHidden"); window.__shelfClipOut = []; });
  await nav(p, "ชั้นวางหนัง"); await wait(p, 400);
  const books = await p.evaluate(() => [...document.querySelectorAll(".book[data-mid]")].slice(0, 3).map((b) => { const r = b.getBoundingClientRect(); return { id: b.dataset.mid, name: b.dataset.movie, x: r.left + r.width / 2, y: r.top + 40 }; }));
  // ① เปิดเล่นด้วยโปรแกรมอื่น เป็นเมนูย่อย กดแล้วกางรายชื่อโปรแกรม เลือกแล้วส่งที่อยู่โปรแกรมไปฝั่ง Rust
  await p.mouse.click(books[0].x, books[0].y, { button: "right" }); await wait(p, 500);
  await click(p, "[data-mm=playWith]"); await wait(p, 200);
  const subs = await p.evaluate(() => [...document.querySelectorAll("[data-ctxmenu] .mm-item.sub")].map((b) => b.dataset.mm));
  check("164.5 เปิดเล่นด้วยโปรแกรมอื่นกางเป็นเมนูย่อย มีโปรแกรมที่ไม่ใช่ตัวหลักของเครื่อง", subs.length >= 1 && subs.every((x) => x.startsWith("with:")), JSON.stringify(subs));
  await snap(p, "164-5-ชั้นวาง-เมนูย่อย");
  await click(p, ".mm-item.sub"); await wait(p, 200);
  const pw = await p.evaluate(() => window.__playedWith);
  check("164.5 เลือกโปรแกรมจากเมนูย่อย ส่งไฟล์กับที่อยู่โปรแกรมไปเปิดเล่น", !!pw && /\.mkv$/i.test(pw.path) && /\.exe$/i.test(pw.player), JSON.stringify(pw));
  // ② เลือกหลายเรื่อง Ctrl คลิก แล้วคลิกขวาได้เมนูของหลายเรื่อง
  await p.keyboard.down("Control"); await p.mouse.click(books[1].x, books[1].y); await p.mouse.click(books[2].x, books[2].y); await p.keyboard.up("Control"); await wait(p, 200);
  const nMulti = await p.evaluate(() => document.querySelectorAll(".book.multi").length);
  check("164.5 กด Ctrl ค้างแล้วคลิก เลือกหลายเรื่องมีกรอบเส้นประ (นับเรื่องที่เปิดแผงขวาอยู่ด้วย)", nMulti === 3, String(nMulti));
  await p.mouse.click(books[2].x, books[2].y, { button: "right" }); await wait(p, 300);
  const mm = await p.evaluate(() => document.querySelector("[data-multimenu]")?.dataset.multimenu);
  await snap(p, "164-5-หลายเรื่อง");
  await click(p, "[data-mm=copyName]"); await wait(p, 200);
  const clipM = await p.evaluate(() => window.__shelfClipOut.slice(-1)[0] ?? "");
  check("164.5 คลิกขวาที่เรื่องที่เลือกไว้ได้เมนูของ 3 เรื่อง คัดลอกชื่อได้ครบสามบรรทัด", mm === "3" && clipM.split("\n").length === 3, JSON.stringify({ mm, clipM }));
  await p.keyboard.press("Escape"); await wait(p, 200);
  check("164.5 Esc เลิกเลือกหลายเรื่อง", await p.evaluate(() => document.querySelectorAll(".book.multi").length === 0), "");
  // ③ หน้าตั้งค่าหัวข้อเมนูคลิกขวา ซ่อนข้อแล้วเมนูไม่ขึ้นข้อนั้น
  await nav(p, "ตั้งค่า"); await wait(p, 400);
  await p.evaluate(() => [...document.querySelectorAll("button,a,li")].filter((x) => !x.closest("[data-navbar]")).find((x) => x.textContent.trim() === "เมนูคลิกขวา")?.click()); await wait(p, 400);
  const sets = await p.evaluate(() => [...document.querySelectorAll("[data-ctxset]")].map((x) => x.dataset.ctxset));
  check("164.5 หัวข้อเมนูคลิกขวามีทุกเมนู ชั้นวาง หลายเรื่อง เปิดล่าสุด คิวแปลง หน้าตรวจไฟล์ ตารางจับคู่ปก", sets.join() === "shelf,shelfMulti,recent,queue,checkRow,linkRow", JSON.stringify(sets));
  await click(p, '[data-ctxitem="shelf:copyName"]'); await wait(p, 150);
  await snap(p, "164-5-หน้าตั้งค่า");
  const saved = await p.evaluate(() => localStorage.getItem("ms.ctxHidden"));
  await nav(p, "ชั้นวางหนัง"); await wait(p, 300);
  await p.mouse.click(books[0].x, books[0].y, { button: "right" }); await wait(p, 300);
  const hid = await ctxState(p);
  check("164.5 ติ๊กออกในหน้าตั้งค่าแล้ว ข้อคัดลอกชื่อเรื่องไม่ขึ้นในเมนูของชั้นวาง และจำไว้", !!hid && !hid.items.includes("copyName") && hid.items.includes("copyPath") && (saved ?? "").includes("copyName"), JSON.stringify({ hid, saved }));
  await p.keyboard.press("Escape");
  await nav(p, "ตั้งค่า"); await wait(p, 300);
  await click(p, "[data-ctx-reset]"); await wait(p, 150);
  check("164.5 ปุ่มแสดงทุกข้อ ล้างที่ซ่อนไว้ แล้วปุ่มกลับเป็นกดไม่ได้", await p.evaluate(() => localStorage.getItem("ms.ctxHidden") == null && document.querySelector("[data-ctx-reset]").getAttribute("aria-disabled") === "true"), "");
  // ④ หน้าตรวจไฟล์ คลิกขวาที่แถว
  await nav(p, "ตรวจไฟล์"); await wait(p, 500);
  const row = await p.evaluate(() => { const r = document.querySelector("[data-ckrow]").getBoundingClientRect(); return { x: r.left + 260, y: r.top + r.height / 2 }; });
  await p.mouse.click(row.x, row.y, { button: "right" }); await wait(p, 300);
  const ck = await ctxState(p);
  await snap(p, "164-5-หน้าตรวจไฟล์");
  check("164.5 หน้าตรวจไฟล์ คลิกขวาที่แถวได้เมนู ตรวจเร็ว ตรวจละเอียด เปิดเล่น กราฟเสียง MediaInfo เปิดโฟลเดอร์ คัดลอก", !!ck && ck.menu === "checkRow" && ["quick", "full", "play", "graph", "info", "reveal", "copyPath"].every((x) => ck.items.includes(x)), JSON.stringify(ck));
  await p.keyboard.press("Escape");
  // ⑤ หน้ากราฟเสียง รายการเปิดล่าสุด
  await graphOpen(p, SONG); await click(p, "[data-graphhome]"); await wait(p, 500);
  const rr = await p.evaluate(() => { const r = document.querySelector("[data-recentrow]")?.getBoundingClientRect(); return r ? { x: r.left + 80, y: r.top + r.height / 2 } : null; });
  if (rr) { await p.mouse.click(rr.x, rr.y, { button: "right" }); await wait(p, 300); }
  const rc = await ctxState(p);
  await snap(p, "164-5-เปิดล่าสุด");
  check("164.5 รายการเปิดล่าสุดของหน้ากราฟ คลิกขวาได้เมนู ดูกราฟ Bitrate ใส่คิวแปลง เปิดโฟลเดอร์ คัดลอก เอาออก", !!rc && rc.menu === "recent" && ["open", "convert", "reveal", "copyPath", "forget"].every((x) => rc.items.includes(x)), JSON.stringify(rc));
  // ใส่คิวแปลงจากเมนู แล้วคลิกขวาที่แถวในคิว
  await click(p, "[data-mm=convert]"); await wait(p, 700);
  const qr = await p.evaluate(() => { const r = document.querySelector(".cqrow[data-qrow]")?.getBoundingClientRect(); return r ? { x: r.left + 60, y: r.top + 20 } : null; });
  if (qr) { await p.mouse.click(qr.x, qr.y, { button: "right" }); await wait(p, 300); }
  const qc = await ctxState(p);
  await snap(p, "164-5-คิวแปลง");
  check("164.5 ใส่คิวแปลงจากเมนูได้ แล้วคลิกขวาที่แถวในคิวได้เมนู ไฟล์ยังไม่แปลงข้อดูไฟล์ใหม่กดไม่ได้", !!qc && qc.menu === "queue" && qc.off.includes("graphOut") && qc.off.includes("compare") && !qc.off.includes("graphSrc"), JSON.stringify(qc));
  await click(p, "[data-mm=remove]"); await wait(p, 300);
  check("164.5 เอาออกจากคิวจากเมนูได้", await p.evaluate(() => !document.querySelector(".cqrow[data-qrow]")), "");
  // ⑥ ตารางจับคู่ปก
  await nav(p, "จับคู่ปก"); await wait(p, 800);
  const lr = await p.evaluate(() => { const r = document.querySelector("[data-link-row] .lname")?.getBoundingClientRect(); return r ? { x: r.left + 20, y: r.top + r.height / 2 } : null; });
  if (lr) { await p.mouse.click(lr.x, lr.y, { button: "right" }); await wait(p, 300); }
  const lc = await ctxState(p);
  await snap(p, "164-5-จับคู่ปก");
  check("164.5 ตารางจับคู่ปก คลิกขวาที่แถวได้เมนู ยืนยัน ครอป เปลี่ยนรูป ข้าม เปิดโฟลเดอร์ คัดลอก", !!lc && lc.menu === "linkRow" && ["confirm", "crop", "change", "skip", "reveal", "copyPath", "copyImg"].every((x) => lc.items.includes(x)), JSON.stringify({ lc, lr }));
  await p.keyboard.press("Escape");
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
