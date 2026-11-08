// ตัวตรวจฝังฟอนต์ของซับ ASS ในหน้าเสียงและซับ (fonts.rs · พี่กันสั่ง 8 พ.ย. 2569 "พวกซับ ass มันต้องฝังฟ้อนด้วยนี่นา ให้มีระบบนี้ด้วยนะ")
// หนังทดสอบมีฟอนต์ tahoma.ttf แนบอยู่แล้ว · ซับ ASS ที่เขียนขึ้นตอนเทสเรียก Tahoma (มีในหนัง) Georgia (อยู่ในโฟลเดอร์ fonts ข้างซับ ชื่อไฟล์ f01.ttf)
// Comic Sans MS (ฟอนต์ของ Windows) และฟอนต์ที่ไม่มีในเครื่อง · ลากไฟล์ฟอนต์ Consolas มาเพิ่มเอง · รวมจริงแล้วอ่านไฟล์แนบของไฟล์ใหม่
// ไม่กดปุ่มเลือกไฟล์ฟอนต์ (หน้าต่างเลือกไฟล์จะเด้งขึ้นจอ) · ไม่แตะ test-media ใช้สำเนาใน D:\dev\tmp
// ใช้: node scripts/check-fonts.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1)
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const T = resolve("src-tauri", "tools");
const AV = join("test-media", "สร้าง", "เสียงซับ");
const OUT = "docs/report-2026-11-07/เสียงซับ-ขั้น2";
const DIR = "D:\\dev\\tmp\\ชั้นฟอนต์ซับ";
const WINF = join(process.env.SystemRoot ?? "C:\\Windows", "Fonts");
rmSync(DIR, { recursive: true, force: true });
mkdirSync(join(DIR, "fonts"), { recursive: true });
mkdirSync(join(DIR, "เพิ่มเอง"), { recursive: true });
const MOVIE = join(DIR, "ฟอนต์แนบ (2024).mkv");
copyFileSync(join(AV, "ฟอนต์แนบ (2024).mkv"), MOVIE);
copyFileSync(join(WINF, "georgia.ttf"), join(DIR, "fonts", "f01.ttf"));
const EXTRA = join(DIR, "เพิ่มเอง", "consola.ttf");
copyFileSync(join(WINF, "consola.ttf"), EXTRA);
const ASS = join(DIR, "ฟอนต์แนบ (2024).th.ass");
writeFileSync(ASS, "\ufeff" + [
  "[Script Info]", "ScriptType: v4.00+", "", "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
  "Style: Default,Tahoma,48,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,2,20,20,30,222",
  "Style: Sign,Georgia,40,&H00FFFFFF,&H000000FF,&H00000000,&H64000000,0,0,0,0,100,100,0,0,1,2,1,8,20,20,30,1",
  "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  "Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\fnComic Sans MS}สวัสดีครับ",
  "Dialogue: 0,0:00:04.00,0:00:06.00,Sign,,0,0,0,,{\\fnฟอนต์ไม่มีในเครื่อง}ป้ายร้าน",
  "",
].join("\r\n"));
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const h0 = sha(MOVIE);
const ident = (p) => JSON.parse(spawnSync(join(T, "mkvmerge.exe"), ["-J", p], { encoding: "utf8", maxBuffer: 64 << 20 }).stdout || "{}");

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const waitFor = async (js, ms = 20000) => { for (let t = 0; t < ms; t += 150) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(150); } return false; };
const drop = (paths) => c.evaluate(`window.__avDrop(${JSON.stringify(paths)}, 400, 300)`);
const shot = async (f, sel) => {
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1200, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await c.evaluate(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' })`);
  await c.move(5, 1190); await sleep(300);
  const r = await c.shot(`${OUT}/${f}`, sel, 6);
  await c.send("Emulation.clearDeviceMetricsOverride");
  return r;
};
const rows = () => q("return Object.fromEntries([...document.querySelectorAll('[data-font]')].map(r => [r.dataset.font, r.dataset.fontState + ' | ' + r.innerText.replace(/\\s+/g, ' ')]))");
const sum = () => q("return document.querySelector('[data-fonts-sum]')?.innerText ?? ''");
const clickFont = (name) => c.evaluate(`document.querySelector('[data-font=${JSON.stringify(name)}] .chk').click()`);

await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('เสียงและซับ')).click()");
await waitFor("return !!document.querySelector('[data-av-page]')");
await c.evaluate("[...document.querySelectorAll('.avfoot button')].find(b => b.innerText.trim() === 'ล้างทั้งหมด')?.click()");
await sleep(400);
await drop([MOVIE]);
await waitFor("return document.querySelector('[data-movie-chip]')?.innerText.includes('ฟอนต์แนบ')", 20000);
check("เปิดหนังที่ยังไม่ได้เพิ่มซับ ASS ไม่มีการ์ดฟอนต์", !(await q("return !!document.querySelector('[data-fonts]')")));

/* ---------- 1 เพิ่มซับ ASS ขึ้นการ์ดฟอนต์ ---------- */
await drop([ASS]);
await waitFor("return document.querySelectorAll('[data-font]').length >= 4", 30000);
const r1 = await rows();
check("เพิ่มซับ ASS ขึ้นการ์ดฟอนต์ 4 ชื่อตามที่ซับเรียก (สไตล์ 2 ตัว กับคำสั่ง \\fn 2 ตัว)", Object.keys(r1).join(",") === "Tahoma,Georgia,Comic Sans MS,ฟอนต์ไม่มีในเครื่อง", Object.keys(r1).join(" · "));
check("Tahoma มีในไฟล์หนังแล้ว ไม่ฝังซ้ำ ติ๊กไม่ได้", r1.Tahoma?.startsWith("inmovie | Tahoma มีในไฟล์หนังแล้ว ไม่ต้องฝังซ้ำ · tahoma.ttf"), r1.Tahoma);
check("Georgia เจอในโฟลเดอร์ fonts ข้างไฟล์ซับ แม้ชื่อไฟล์เป็น f01.ttf (อ่านชื่อจากในไฟล์) ติ๊กฝังไว้", r1.Georgia?.startsWith("on | Georgia เจอข้างไฟล์ซับ · f01.ttf"), r1.Georgia);
check("Comic Sans MS เจอในฟอนต์ของ Windows ติ๊กฝังไว้ บอกขนาด", r1["Comic Sans MS"]?.startsWith("on | Comic Sans MS ฟอนต์ของ Windows · comic.ttf ·") && /KB|MB/.test(r1["Comic Sans MS"]), r1["Comic Sans MS"]);
check("ฟอนต์ที่ไม่มีในเครื่อง บอกว่าไม่เจอ พร้อมวิธีเพิ่มเอง ติ๊กไม่ได้", r1["ฟอนต์ไม่มีในเครื่อง"]?.startsWith("missing | ฟอนต์ไม่มีในเครื่อง ไม่เจอในเครื่อง · ลากไฟล์ฟอนต์"), r1["ฟอนต์ไม่มีในเครื่อง"]);
const s1 = await sum();
check("หัวการ์ดบอกว่าฝังไปด้วย 2 ไฟล์ พร้อมขนาดรวม", s1.startsWith("ฝังไปด้วย 2 ไฟล์ ·"), s1);

/* ---------- 2 ติ๊กออกแล้วติ๊กกลับ ---------- */
await clickFont("Comic Sans MS");
await sleep(200);
const off = `${(await rows())["Comic Sans MS"].split(" | ")[0]} · ${await sum()}`;
await clickFont("Comic Sans MS");
await sleep(200);
const back = `${(await rows())["Comic Sans MS"].split(" | ")[0]} · ${await sum()}`;
check("กดติ๊กออก ไม่ฝัง เหลือ 1 ไฟล์ · กดอีกครั้งกลับมาฝัง 2 ไฟล์", off.startsWith("off · ฝังไปด้วย 1 ไฟล์") && back.startsWith("on · ฝังไปด้วย 2 ไฟล์"), `${off} → ${back}`);
await clickFont("Tahoma");
await sleep(200);
check("กดแถวที่มีในหนังแล้ว ไม่เปลี่ยน", (await rows()).Tahoma.startsWith("inmovie") && (await sum()).startsWith("ฝังไปด้วย 2 ไฟล์"));

/* ---------- 3 ลากไฟล์ฟอนต์มาเพิ่มเอง ---------- */
await drop([EXTRA]);
await waitFor("return !!document.querySelector('[data-font=\"Consolas\"]')", 10000);
const r3 = await rows();
check("ลากไฟล์ฟอนต์ consola.ttf มาวาง ขึ้นแถว Consolas เพิ่มเอง ติ๊กฝังไว้ · รวม 3 ไฟล์", r3.Consolas?.startsWith("on | Consolas เพิ่มเอง · consola.ttf") && (await sum()).startsWith("ฝังไปด้วย 3 ไฟล์"), `${r3.Consolas} · ${await sum()}`);
await drop([EXTRA]);
await sleep(500);
check("ลากไฟล์ฟอนต์เดิมซ้ำ ไม่เพิ่มแถวซ้ำ", (await q("return document.querySelectorAll('[data-font]').length")) === 5);
await shot("36-ฟอนต์ซับASS.png", "[data-fonts]");

/* ---------- 4 MP4 ฝังฟอนต์ไม่ได้ ---------- */
await c.evaluate("[...document.querySelectorAll('.seg button')].find(b => b.innerText.trim() === 'MP4').click()");
await waitFor("return !!document.querySelector('[data-fonts-mp4]')", 5000);
check("เลือกไฟล์ที่ได้เป็น MP4 การ์ดฟอนต์เตือนว่า MP4 ฝังฟอนต์ไม่ได้", (await q("return document.querySelector('[data-fonts-mp4]')?.innerText ?? ''")).includes("MP4 ฝังฟอนต์ไม่ได้"));
await c.evaluate("[...document.querySelectorAll('.seg button')].find(b => b.innerText.trim() === 'MKV (แนะนำ)').click()");
await sleep(300);

/* ---------- 5 รวมจริง ---------- */
await c.evaluate("document.querySelector('[data-start]').click()");
const okRun = await waitFor("const r = document.querySelector('[data-run]')?.dataset.run; return r === 'done' || r === 'failed'", 120000);
await sleep(400);
const runText = (await q("return document.querySelector('[data-run]')?.innerText ?? ''")).replace(/\s+/g, " ");
check("รวมเสร็จ ไฟล์ใหม่ตรวจผ่าน (ตัวตรวจเช็กว่าไฟล์แนบครบตามที่สั่ง) · ผลบอกว่าฝังฟอนต์ของซับ 3 ไฟล์", okRun && runText.includes("รวมเสร็จ ไฟล์ใหม่ตรวจผ่าน") && runText.includes("ฝังฟอนต์ของซับ 3 ไฟล์"), runText.slice(0, 260));
await shot("37-ฝังฟอนต์รวมเสร็จ.png", "[data-run]");
const j = existsSync(MOVIE) ? ident(MOVIE) : { attachments: [] };
const atts = (j.attachments ?? []).map((a) => `${a.file_name.toLowerCase()}|${a.content_type}`).sort();
check("ไฟล์ใหม่มีไฟล์แนบ comic.ttf consola.ttf f01.ttf (font/ttf) กับ tahoma.ttf เดิม ไม่ซ้ำ", JSON.stringify(atts.map((a) => a.split("|")[0])) === JSON.stringify(["comic.ttf", "consola.ttf", "f01.ttf", "tahoma.ttf"])
  && atts.filter((a) => !a.startsWith("tahoma")).every((a) => a.endsWith("|font/ttf")), atts.join(" · "));
const subs = (j.tracks ?? []).filter((t) => t.type === "subtitles").map((t) => `${t.codec}|${t.properties.language}`);
check("ซับ ASS ที่เพิ่มอยู่ในไฟล์ใหม่ ภาษาไทย", subs.includes("SubStationAlpha|tha"), subs.join(" · "));
check("ไฟล์เดิมย้ายไปโฟลเดอร์ไฟล์เดิม hash เท่าก่อนรวม · ไม่มี .partial ค้าง", existsSync(join(DIR, "ไฟล์เดิม", "ฟอนต์แนบ (2024).mkv")) && sha(join(DIR, "ไฟล์เดิม", "ฟอนต์แนบ (2024).mkv")) === h0 && readdirSync(DIR).every((f) => !f.endsWith(".partial")));

const pass = results.filter((r) => r.pass).length;
writeFileSync(`${OUT}/ผลเทส-ฟอนต์ซับ.json`, JSON.stringify(results, null, 2));
console.log(`ผ่าน ${pass} จาก ${results.length}`);
process.exitCode = pass === results.length ? 0 : 1;
c.close();
