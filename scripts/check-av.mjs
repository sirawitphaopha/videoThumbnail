// เทสหน้าเสียงและซับ (แผนเสียงและซับ ขั้น 2) ในหน้าต่างโปรแกรมจริง ผ่านพอร์ตดีบัก · ถ่ายภาพทุกสถานะลงโฟลเดอร์รายงาน
// ลากไฟล์จำลองด้วยตัวรับไฟล์ของหน้า (window.__avDrop มีเฉพาะตอนทดสอบ) · ไฟล์หนังเป็นสำเนาในโฟลเดอร์ทดสอบ ไม่แตะ test-media
// ใช้: node scripts/check-av.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1 แบบอยู่หลังสุด)
import { mkdirSync, writeFileSync, copyFileSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const ROOT = process.cwd();
const AV = join(ROOT, "test-media", "สร้าง", "เสียงซับ");
const IMG = join(ROOT, "test-media", "สร้าง", "รูป");
const T = join(ROOT, "src-tauri", "tools");
const DIR = "D:\\dev\\tmp\\ชั้นหน้าเสียงซับ";
const OUT = "docs/report-2026-11-07/เสียงซับ-ขั้น2";
mkdirSync(OUT, { recursive: true });
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const ident = (p) => JSON.parse(spawnSync(join(T, "mkvmerge.exe"), ["-J", p], { encoding: "utf8", maxBuffer: 64 << 20 }).stdout || "{}");

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const shot = async (f, sel, pad = 0) => { await c.move(5, 700); await sleep(250); return c.shot(`${OUT}/${f}`, sel, pad); };
const waitFor = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const drop = (paths) => c.evaluate(`window.__avDrop(${JSON.stringify(paths)}, 400, 300)`);
const row = (i) => `document.querySelectorAll('.trk:not(.head)')[${i}]`;

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
copyFileSync(join(AV, "ดาวตก (2024).mkv"), join(DIR, "ดาวตก (2024).mkv"));
const MOVIE = join(DIR, "ดาวตก (2024).mkv");
const h0 = sha(MOVIE);
await inv("dev_fake_free", { bytes: 0 });
await inv("set_settings", { patch: { folders: [DIR], originalAfter: "keep", outputFormat: "mkv", checkSourceBefore: true, checkOutputAfter: true } });
await c.evaluate("location.hash = ''; location.reload()");
await sleep(1500);
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });

// ---------- เมนูซ้าย · หน้าว่าง ----------
await c.evaluate(`[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('เสียงและซับ')).click()`);
await waitFor("return !!document.querySelector('[data-av-page]')");
const empty = await q("return document.querySelector('[data-av-page]').innerText");
const navs = await q("return [...document.querySelectorAll('.side .nav')].map(b => b.innerText.trim()).join('|')");
check("เมนูซ้ายมีหน้าเสียงและซับต่อจากใส่โปสเตอร์ · หน้าว่างบอกให้ลากไฟล์หนัง", empty.includes("ลากไฟล์หนังมาวางตรงนี้") && empty.includes("แล้วลากไฟล์เสียงหรือซับตามมาวางได้เลย") && navs.includes("ใส่โปสเตอร์|เสียงและซับ"), navs);
await shot("01-หน้าว่าง.png", ".main");

// ---------- ลากหนังกับเสียงซับมาพร้อมกัน ----------
await drop([join(AV, "ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3"), MOVIE, join(AV, "ดาวตก (2024).th.srt"), join(AV, "ดาวตก (2024).tis620.th.srt"), join(AV, "ดาวตก (2024).en.vtt")]);
await waitFor("return document.querySelectorAll('.trk:not(.head)').length >= 6", 30000);
await sleep(600);
const rows = await q("return [...document.querySelectorAll('.trk:not(.head)')].map(r => r.innerText.replace(/\\s+/g, ' '))");
check("ไม่มีแถบแจ้งค้างบนจอหลังเพิ่มไฟล์ (ข้อความแจ้งอยู่ที่ป้ายในแถว)", (await q("return document.querySelectorAll('.toast').length")) === 0);
check("ลากหนังกับเสียงซับมาพร้อมกัน โปรแกรมแยกเองว่าไฟล์ไหนเป็นหนัง · ได้ 6 แถว", rows.length === 6 && rows[0].includes("H.264") && rows[1].includes("AAC") && rows[2].includes("AC-3") && rows[2].includes("เพิ่มใหม่"), rows.map((r) => r.slice(0, 40)).join(" | "));
const d2 = await q(`return ${row(2)}.querySelector('.avnum').value`);
check("พากย์ไทย ดีเลย์ −120 จากชื่อไฟล์ ขึ้นป้าย · ภาษาไทยจากชื่อ · 5.1", rows[2]?.includes("ดีเลย์จากชื่อไฟล์") && rows[2].includes("ไทย") && rows[2].includes("5.1") && d2 === "-120", d2);
check("ซับ TIS-620 ขึ้นป้าย · ซับ VTT ขึ้นป้าย แปลงเป็น SRT", rows[4]?.includes("TIS-620") && rows[5]?.includes("แปลงเป็น SRT"), `${rows[4]?.slice(0, 60)} | ${rows[5]?.slice(0, 60)}`);
const chips = await q("return [...document.querySelectorAll('.trk:not(.head) .ft')].map(f => f.innerText + ':' + getComputedStyle(f).backgroundColor)");
check("คอลัมน์ชนิด H.264 AAC AC-3 SRT SRT VTT สีต่างกันตามชนิด", new Set(chips.map((x) => x.split(":")[1])).size >= 4 && chips.map((x) => x.split(":")[0]).join(" ") === "H.264 AAC AC-3 SRT SRT VTT", chips.join(" | "));
await shot("02-ตารางแทร็ก.png", ".main");

// ---------- ภาษา ----------
await c.evaluate(`${row(3)}.querySelector('[data-lang-btn]').click()`);
await waitFor("return !!document.querySelector('[data-lang-pop]')");
const pop = await q("const r = document.querySelector('[data-lang-pop]').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, first: [...document.querySelectorAll('[data-lang-pop] .lrow')].slice(0, 2).map(x => x.innerText.split('\\n')[0]).join(','), n: document.querySelectorAll('[data-lang-pop] .lrow').length }");
check("รายการภาษา ไทย อังกฤษ บนสุด ครบราวพันภาษา ไม่ล้นขอบจอ", pop.first === "ไทย,อังกฤษ" && pop.n > 900 && pop.bottom <= pop.h && pop.top >= 34, JSON.stringify(pop));
await shot("03-รายการภาษา.png", ".main");
await c.type("jpn");
await sleep(250);
const jp = await q("return [...document.querySelectorAll('[data-lang-pop] .lrow')].map(x => x.innerText.split('\\n')[0])");
check("พิมพ์ค้นรหัส jpn เจอญี่ปุ่น", jp[0] === "ญี่ปุ่น", jp.slice(0, 3).join(","));
await c.key("Escape");
await sleep(200);
await c.evaluate(`${row(3)}.querySelector('[data-lang-btn]').click()`);
await waitFor("return !!document.querySelector('[data-lang-pop]')");
await c.type("ำืเ");
await sleep(250);
const sw = await q("return [...document.querySelectorAll('[data-lang-pop] .lrow')].map(x => x.innerText.split('\\n')[0])");
check("ลืมสลับแป้นพิมพ์ ำืเ (คือ eng) ก็หาเจออังกฤษ", sw[0] === "อังกฤษ", sw.slice(0, 3).join(","));
await c.key("Escape");
await sleep(200);

// ---------- ตั้งหลัก ดีเลย์ ----------
await c.evaluate(`${row(2)}.querySelector('[data-main]').click()`);
await c.evaluate(`${row(3)}.querySelector('[data-main]').click()`);
await c.evaluate(`${row(3)}.click()`);
for (let i = 0; i < 5; i++) await c.evaluate(`[...${row(3)}.querySelectorAll('.delay button')][1].click()`);
await sleep(200);
const d3 = await q(`return ${row(3)}.querySelector('.avnum').value`);
check("ปุ่ม + ดีเลย์ทีละ 100 ms กด 5 ครั้งได้ +500", d3 === "+500", d3);
const mains = await q("return [...document.querySelectorAll('.trk:not(.head) [data-main]')].map(r => r.getAttribute('aria-checked'))");
check("ตั้งพากย์ไทยเป็นเสียงหลัก ซับไทยเป็นซับหลัก · หลักมีแทร็กเดียวต่อชนิด", JSON.stringify(mains) === JSON.stringify(["false", "true", "true", "false", "false"]), mains.join(","));
const detail = await q("return document.querySelector('[data-track-detail]')?.innerText ?? ''");
check("การ์ดตั้งค่าแทร็กของแถวที่กด ภาษา ชื่อ ซับหลัก ดีเลย์", detail.includes("ตั้งค่าแทร็ก") && detail.includes("ตั้งเป็นซับหลัก") && detail.includes("ติดลบ = ซับมาเร็วขึ้น"), detail.replace(/\s+/g, " ").slice(0, 80));
await shot("04-ตั้งค่าแทร็ก.png", "[data-track-detail]", 6);

// ---------- เอาออก เลื่อนลำดับ ----------
await c.evaluate(`${row(1)}.querySelector('[data-remove]').click()`);
await sleep(150);
const out1 = await q(`return ${row(1)}.className + ' · ' + document.querySelector('[data-counts]').innerText`);
check("เอาเสียงเดิมออก แถวจาง ขีดฆ่า นับว่าเอาออก 1", out1.includes("out") && out1.includes("เอาออก 1"), out1);
await c.evaluate(`${row(1)}.querySelector('[data-undo]').click()`);
await c.evaluate(`${row(2)}.querySelectorAll('.mv button')[0].click()`);
await sleep(150);
const ord = await q("return [...document.querySelectorAll('.trk:not(.head) .ft')].map(f => f.innerText).join(' ')");
check("เอากลับได้ · เลื่อนพากย์ไทยขึ้นเหนือเสียงเดิม", ord === "H.264 AC-3 AAC SRT SRT VTT", ord);

// ---------- ปก ----------
await c.evaluate(`window.__avDrop(${JSON.stringify([join(IMG, "poster.jpg")])}, 0, 0)`);
await waitFor("return !!document.querySelector('[data-use]')", 20000);
await sleep(900);
await c.evaluate("document.querySelector('[data-use]').click()");
await waitFor("return document.querySelector('[data-slot=cover]').innerText.includes('เพิ่มใหม่')", 20000);
await sleep(300);
const slot = await q("return document.querySelector('[data-slot=cover]').innerText.replace(/\\s+/g, ' ')");
check("ลากรูปแนวตั้งมาวาง หน้าครอปขึ้น กดใช้รูปนี้ ช่องปกตั้งเป็นรูปใหม่", slot.includes("cover.jpg") && slot.includes("เพิ่มใหม่") && slot.includes("ครอปใหม่"), slot);
await shot("05-ปก.png", "[data-slot=cover]", 6);

// ---------- ไปหน้าอื่นแล้วกลับมา งานยังอยู่ ----------
await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('ตั้งค่า')).click()");
await sleep(500);
await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('เสียงและซับ')).click()");
await waitFor("return document.querySelectorAll('.trk:not(.head)').length > 0");
const back = await q("return [...document.querySelectorAll('.trk:not(.head) .ft')].map(f => f.innerText).join(' ') + ' · ' + document.querySelector('[data-slot=cover]').innerText.includes('เพิ่มใหม่') + ' · ' + document.querySelectorAll('.trk:not(.head)')[3].querySelector('.avnum').value");
check("ไปหน้าตั้งค่าแล้วกลับมา แทร็ก ลำดับ ดีเลย์ ปกใหม่ ยังอยู่ครบ", back === "H.264 AC-3 AAC SRT SRT VTT · true · +500", back);

// ---------- แผงตั้งค่าเสียงแบบง่าย (ขั้น 4) · เสียงอังกฤษ AAC ในหนัง แปลงเป็น Opus เพิ่มคู่ ----------
await c.evaluate(`${row(2)}.querySelector('[data-conv]').click()`);
await waitFor("return !!document.querySelector('[data-codec-panel]') && document.querySelector('[data-cmd]').innerText.includes('opusenc')", 15000);
const cmd1 = await q("return document.querySelector('[data-cmd]').innerText");
check("กดช่องแปลง แผงตั้งค่าเสียงขึ้น ค่าตั้งต้น Opus ตัวต้นฉบับ opusenc คำสั่งที่จะรันมาจากฝั่ง Rust", cmd1.includes("ffmpeg -hide_banner") && cmd1.includes("opusenc --quiet --ignorelength --bitrate 384"), cmd1.replace(/\s+/g, " ").slice(0, 160));
await c.evaluate("document.querySelector('[data-preset=\"1\"]').click()");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('--bitrate 160')", 8000);
const panelText = await q("return document.querySelector('[data-codec-panel]').innerText");
check("เลือกชุดเพลงคุณภาพดี คำสั่งเปลี่ยนเป็น 160 kbps · บอกขนาดทั้งแทร็ก · เตือนแปลงเสียคุณภาพซ้อน · เพิ่มคู่เป็นค่าตั้งต้น",
  panelText.includes("ทั้งแทร็กราว") && panelText.includes("แปลงแบบเสียคุณภาพซ้อน AAC เป็น Opus") && panelText.includes("แทร็กใหม่ชื่อ English Opus ต่อท้ายแทร็กเดิม"), panelText.replace(/\s+/g, " ").slice(0, 200));
// ความเร็วเสียง Gain ความดังมาตรฐาน · คำสั่งต้องมีตัวกรองตามที่ตั้ง แล้วตั้งกลับ ไม่ให้กระทบการรวมข้างล่าง
const pickDd = async (label, text) => {
  await c.evaluate(`[...document.querySelectorAll('[data-codec-panel] .dd')].find(b => b.getAttribute('aria-label').startsWith(${JSON.stringify(label)})).click()`);
  await sleep(200);
  await c.evaluate(`[...document.querySelectorAll('[data-codec-panel] [role=option]')].find(o => o.innerText.startsWith(${JSON.stringify(text)})).click()`);
  await sleep(200);
};
await pickDd("ความเร็วเสียง", "25 → 23.976");
for (let i = 0; i < 3; i++) await c.evaluate("document.querySelector('[data-codec-panel] [aria-label=\"ลดความดัง 1 dB\"]').click()");
await c.evaluate("[...document.querySelectorAll('[data-codec-panel] [data-extra] .seg button')].find(b => b.innerText.startsWith('EBU')).click()");
await waitFor("return document.querySelector('[data-cmd]').innerText.includes('loudnorm')", 8000);
const cmd2 = await q("return document.querySelector('[data-cmd]').innerText.replace(/\\s+/g, ' ')");
check("ตั้งความเร็ว 25 → 23.976 Gain −3 dB ความดังมาตรฐาน คำสั่งมี rubberband=tempo=0.959040,volume=-3dB,loudnorm", cmd2.includes('-af "rubberband=tempo=0.959040,volume=-3dB,loudnorm=I=-23:TP=-1"'), cmd2.slice(0, 220));
await shot("11-แผงตั้งค่าเสียง-ความเร็ว.png", "[data-extra]", 8);
await pickDd("ความเร็วเสียง", "ไม่เปลี่ยน");
for (let i = 0; i < 3; i++) await c.evaluate("document.querySelector('[data-codec-panel] [aria-label=\"เพิ่มความดัง 1 dB\"]').click()");
await c.evaluate("[...document.querySelectorAll('[data-codec-panel] [data-extra] .seg button')].find(b => b.innerText === 'Off').click()");
await waitFor("return !document.querySelector('[data-cmd]').innerText.includes('-af')", 8000);
await shot("10-แผงตั้งค่าเสียง.png", "[role=dialog]", 8);
await c.evaluate("document.querySelector('[data-conv-use]').click()");
await sleep(300);
const convCell = await q(`return ${row(2)}.querySelector('[data-conv]').innerText + ' · ' + ${row(2)}.innerText.includes('แปลง')`);
check("กดใช้ค่านี้ ช่องแปลงขึ้น Opus 160 · เพิ่มคู่ แถวมีป้ายแปลง", convCell.startsWith("Opus 160 · เพิ่มคู่") && convCell.endsWith("true"), convCell);

// ---------- หน้าต่างบอกเรื่อง VTT ก่อนรวม แล้วรวมจริง ----------
await c.evaluate("document.querySelector('[data-start]').click()");
await waitFor("return !!document.querySelector('[data-vtt-dialog]')");
const vd = await q("return document.querySelector('[data-vtt-dialog]')?.closest('[role=dialog]')?.innerText ?? ''");
check("กดรวม มีซับ VTT ขึ้นหน้าต่างบอกก่อนว่าจะแปลง VTT เป็น SRT (พี่กันสั่ง)", vd.includes("ก่อนรวม โปรแกรมจะแปลงซับ VTT เป็น SRT") && vd.includes("ดาวตก (2024).en.vtt") && vd.includes("แปลงแล้วรวมต่อ"), vd.replace(/\s+/g, " ").slice(0, 120));
await shot("06-หน้าต่างแปลงVTT.png", "[role=dialog]", 8);
await c.evaluate("document.querySelector('[data-vtt-ok]').click()");
const okRun = await waitFor("const r = document.querySelector('[data-run]')?.dataset.run; return r === 'done' || r === 'failed'", 120000);
await sleep(400);
const runText = await q("return document.querySelector('[data-run]')?.innerText ?? ''");
check("รวมเสร็จ ไฟล์ใหม่ตรวจผ่าน ภาพ 1 เสียง 3 (Opus ที่แปลงเพิ่มคู่) ซับ 3 · ไฟล์เดิมย้ายไปไฟล์เดิม", okRun && runText.includes("รวมเสร็จ ไฟล์ใหม่ตรวจผ่าน") && runText.includes("ภาพ 1 · เสียง 3 · ซับ 3") && runText.includes("ไฟล์เดิม"), runText.replace(/\s+/g, " ").slice(0, 220));
await shot("07-รวมเสร็จ.png", ".main");
const j = existsSync(MOVIE) ? ident(MOVIE) : { tracks: [], attachments: [] };
const got = (j.tracks ?? []).map((t) => `${t.codec}|${t.properties.language}|${t.properties.default_track ? 1 : 0}`);
check("ไฟล์ใหม่ ภาพ พากย์ไทยหลัก AAC Opus ที่แปลงเพิ่มคู่ ซับไทยหลัก ซับไทยเก่า ซับอังกฤษ SRT · มีปก cover.jpg", got[1] === "AC-3|tha|1" && got[2] === "AAC|eng|0" && got[3] === "Opus|eng|0" && got[4] === "SubRip/SRT|tha|1" && got[6] === "SubRip/SRT|eng|0" && (j.attachments ?? []).some((a) => a.file_name === "cover.jpg"), got.join(" · "));
check("ไฟล์เดิม hash เท่าก่อนรวม", existsSync(join(DIR, "ไฟล์เดิม", "ดาวตก (2024).mkv")) && sha(join(DIR, "ไฟล์เดิม", "ดาวตก (2024).mkv")) === h0);
check("ไม่มีไฟล์ชั่วคราว .partial ค้าง", readdirSync(DIR).every((f) => !f.endsWith(".partial")));

// ---------- ปุ่มเสียงและซับในแผงขวาของชั้นวาง ----------
await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('ชั้นวางหนัง')).click()");
await inv("scan_library");
await sleep(1500);
await waitFor("return !!document.querySelector('.book[data-movie=\"ดาวตก (2024)\"]')", 15000);
await c.click('.book[data-movie="ดาวตก (2024)"]');
await waitFor("return !!document.querySelector('[data-shelfav]')", 8000);
await shot("08-ปุ่มบนชั้นวาง.png", ".detail .actions", 6);
await c.evaluate("document.querySelector('[data-shelfav]')?.click()");
const opened = await waitFor("return document.querySelector('[data-movie-chip]')?.innerText.includes('ดาวตก')", 15000);
check("ปุ่มเสียงและซับในแผงขวาของชั้นวาง คู่กับกราฟเสียง เปิดหน้าเสียงและซับพร้อมเรื่องนั้น", opened, opened ? "" : await q("return document.querySelector('.main').innerText.slice(0,120)"));

// ---------- การ์ดตัวแปลงเสียงในหน้าตั้งค่า (ขั้น 4) · ไม่กดปุ่มเปิดโฟลเดอร์ (จะเปิด Explorer ขึ้นจอ) ----------
await c.evaluate("[...document.querySelectorAll('.side .nav')].find(b => b.innerText.includes('ตั้งค่า')).click()");
await waitFor("return document.querySelectorAll('[data-setcard=encoders] [data-enc]').length >= 7", 20000);
const encRows = await q("return [...document.querySelectorAll('[data-setcard=encoders] [data-enc]')].map(r => r.innerText.replace(/\\s+/g, ' '))");
const encText = await q("return document.querySelector('[data-setcard=encoders]').innerText");
check("หน้าตั้งค่ามีการ์ดตัวแปลงเสียง flac 1.5.0 · libopus 1.6.1 · LAME 4.0 · wavpack 5.9.0 แนบมากับโปรแกรม พร้อมใช้งาน · qaac fdkaac ยังไม่ได้ใส่ · บอกโฟลเดอร์ตัวแปลง",
  encRows.some((r) => r.includes("flac") && r.includes("1.5.0") && r.includes("แนบมากับโปรแกรม") && r.includes("พร้อมใช้งาน")) && encRows.some((r) => r.includes("libopus 1.6.1")) && encRows.some((r) => r.startsWith("lame") && r.includes("4.0"))
  && encRows.some((r) => r.includes("wavpack") && r.includes("5.9.0")) && encRows.some((r) => r.includes("qaac64") && r.includes("ยังไม่ได้ใส่")) && encText.includes(String.raw`ชั้นหนัง\ตัวแปลง`), encRows.join(" | "));
await c.evaluate("document.querySelector('[data-setcard=encoders]').scrollIntoView({ block: 'center' })");
await shot("09-การ์ดตัวแปลงเสียง.png", "[data-setcard=encoders]", 6);

await c.send("Emulation.clearDeviceMetricsOverride");
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 2) + "\n");
const failed = results.filter((x) => !x.pass);
console.log(`\nผ่าน ${results.length - failed.length} จาก ${results.length}`);
c.close();
process.exit(failed.length ? 1 : 0);
