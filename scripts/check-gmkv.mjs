// BUGS ข้อ 130 วิธีแยกไฟล์แบบ gMKVExtractGUI ในหน้าเสียงและซับ · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-gmkv.mjs
// แท็ก XML · chapter แบบ OGM · CUE sheet · เวลาของแต่ละเฟรม · ดีเลย์ของเสียงในชื่อไฟล์ · รูปแบบชื่อไฟล์ในหน้าตั้งค่า · แยกหลายไฟล์
// ทำงานกับสำเนาหนังทดสอบใน D:\dev\tmp\ชั้นแยกแบบgMKV ลบตอนจบ · เลือกหลายไฟล์ผ่าน window.__extractFiles ไม่เปิดกล่องเลือกไฟล์ · คืนรูปแบบชื่อเดิมตอนจบ
// ตอนพี่กันทำงานอยู่ส่ง NOGATE=1 ข้ามด่านหน้าต่างหน้าสุด
import { mkdirSync, copyFileSync, rmSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";
import { linesOf } from "./lib/lines.mjs";

const NOGATE = process.env.NOGATE === "1";
const gate = () => { if (NOGATE) return; try { execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/fg-gate.ps1"], { stdio: "ignore" }); } catch { console.log("หน้าต่างชั้นหนังอยู่หน้าสุดของจอ หยุดตรวจ"); process.exit(2); } };
gate();

const SRC = "D:/movie-shelf/test-media/สร้าง/หนัง";
const TMP = "D:/dev/tmp/ชั้นแยกแบบgMKV";
const MOVIE = `${TMP}/ดาวเหนือ (2023).mkv`;
const LATE = `${TMP}/เสียงช้า (2023).mkv`;
const OTHER = `${TMP}/Vorbis Test (2010).mkv`;
const SHOT = "docs/report-2026-11-15/แยกแบบgMKV";
const MKVMERGE = "D:/movie-shelf/src-tauri/tools/mkvmerge.exe";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(SHOT, { recursive: true });
copyFileSync(`${SRC}/ดาวเหนือ (2023).mkv`, MOVIE);
copyFileSync(`${SRC}/Vorbis Test (2010).mkv`, OTHER);
// หนังที่เสียงแรกช้ากว่าภาพ 120 มิลลิวินาที ไว้ดูดีเลย์ในชื่อไฟล์
execFileSync(MKVMERGE, ["-q", "-o", LATE, "--sync", "1:120", MOVIE], { stdio: "ignore" });

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})});`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click(); return 1;`);
const click = async (sel) => { gate(); await c.click(sel); };
const folderOf = (m) => m.replace(/\.mkv$/, " แยกไฟล์");
const ls = (d) => existsSync(d) ? readdirSync(d).sort() : [];

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const before = (await inv("get_settings")).settings;
const pat0 = before.extractPattern;
try {
  /* ---------------------------------------------------------------- หน้าตั้งค่า รูปแบบชื่อไฟล์ */
  await nav("ตั้งค่า"); await sleep(400);
  await c.setNav("av"); await sleep(300);
  // เริ่มจากค่าตั้งต้นเสมอ แล้วโหลดหน้าใหม่ หน้าตั้งค่าจำค่าที่โหลดไว้ ไม่รู้ว่าตัวตรวจเปลี่ยนค่าตั้งเอง
  await inv("set_settings", { patch: { extractPattern: "{Filename}.{Type}{Number}.{Language}{Delay}" } });
  await q("location.reload(); return 1;"); await sleep(3500); await nav("ตั้งค่า"); await sleep(500); await c.setNav("av"); await sleep(300);
  const prev0 = await q("return document.querySelector('[data-pattern-preview] .patsample')?.innerText.trim() ?? ''");
  check("แถวรูปแบบชื่อไฟล์ที่แยกในหัวข้อเสียงและซับ ตัวอย่างค่าตั้งต้นได้ชื่อแบบเดิมต่อท้ายดีเลย์", prev0 === "ดาวเหนือ (2023).Audio1.th DELAY -120ms.ac3", prev0);
  check("ค่าตั้งต้นอยู่แล้ว ปุ่มค่าตั้งต้นกดไม่ได้พร้อมเหตุผล", await q("const b = document.querySelector('[data-pattern-reset]'); return b.getAttribute('aria-disabled') === 'true' && b.title === 'ใช้ค่าตั้งต้นอยู่แล้ว';"));
  const tipN = await q("const b = document.querySelector('[data-extract-pattern-set] [data-info]'); b.click(); await new Promise((r) => setTimeout(r, 300)); const t = document.querySelector('.infotip'); const n = t ? t.querySelectorAll('.to').length : 0; document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return n;");
  check("ปุ่ม ⓘ อธิบายตัวแทนครบ 6 ตัว", tipN === 6, String(tipN));
  await c.shot(`${SHOT}/01-ตั้งค่ารูปแบบชื่อ.png`, "[data-extract-pattern-set]", 10);
  // พิมพ์รูปแบบใหม่ ตัวอย่างเปลี่ยนตาม แล้วบันทึกตอนกดออก
  const CUSTOM = "{Type}{Number}{Delay} - {Language} - {Filename}";
  await q(`const i = document.querySelector('[data-pattern-input]'); i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(CUSTOM)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
  await sleep(200);
  const prev1 = await q("return document.querySelector('[data-pattern-preview] .patsample')?.innerText.trim() ?? ''");
  check("พิมพ์รูปแบบใหม่ ตัวอย่างเปลี่ยนตามที่พิมพ์", prev1 === "Audio1 DELAY -120ms - th - ดาวเหนือ (2023).ac3", prev1);
  await q("document.querySelector('[data-pattern-input]').blur(); return 1;"); await sleep(500);
  check("กดออกจากช่องแล้วบันทึกลงค่าตั้ง", (await inv("get_settings")).settings.extractPattern === CUSTOM);
  const lines = (await linesOf(q, "[data-extract-pattern-set] .lbl > .small"))?.[0] ?? "";
  check("คำอธิบายใต้หัวข้อบรรทัดเดียว", lines && !lines.includes("⏎"), lines);

  /* ---------------------------------------------------------------- หน้าเสียงและซับ แถวแยกแบบใหม่ */
  await nav("เสียงและซับ"); await sleep(500);
  await q(`window.__avDrop([${JSON.stringify(MOVIE)}], 400, 300); return 1;`);
  await waitFor("return (document.querySelector('[data-movie-chip]')?.innerText ?? '').includes('ดาวเหนือ')", 20000);
  await q("[...document.querySelectorAll('[data-method] .avm-card')].find((b) => b.innerText.includes('แยกออกจากหนัง')).click(); return 1;");
  check("ไฟล์ MKV ขึ้นแถวแท็ก Chapter แบบ OGM CUE sheet และเวลาของแต่ละเฟรม", await waitFor("return ['tags:1', 'ogm:1', 'cue:1', 'ts:1'].every((k) => !!document.querySelector(`[data-xextra=\"${k}\"]`))", 20000));
  // แถวแทร็กมาจาก MediaInfo วาดทีหลังแถวใหม่ได้ · ล้างช่องที่ติ๊กค้างจากรอบก่อน
  await waitFor("return ['audio:1', 'text:2'].every((k) => !!document.querySelector(`[data-xpick=\"${k}\"]`))", 20000);
  await q("for (const e of [...document.querySelectorAll('[data-xpick][aria-checked=true]')]) { e.click(); await new Promise((r) => setTimeout(r, 60)); } return 1;"); await sleep(200);
  const tsOff = await q("const c = document.querySelector('[data-xpick=\"ts:1\"]'); return [c.getAttribute('aria-disabled'), c.title, document.querySelector('[data-xextra=\"ts:1\"] .xnote').innerText.trim()];");
  check("ยังไม่ติ๊กแทร็ก แถวเวลาของแต่ละเฟรมกดไม่ได้พร้อมเหตุผล", tsOff[0] === "true" && tsOff[1] === "ติ๊กแทร็กภาพ เสียง หรือซับก่อน", tsOff.join(" | "));
  const tipsX = await q("return [...document.querySelectorAll('[data-xextra] [data-info]')].length");
  check("ทุกแถวใหม่มีปุ่ม ⓘ", tipsX === 4, String(tipsX));
  await q("['audio:1', 'text:2'].forEach((k) => document.querySelector(`[data-xpick=\"${k}\"]`).click()); return 1;"); await sleep(200);
  const tsOn = await q("const c = document.querySelector('[data-xpick=\"ts:1\"]'); return [c.getAttribute('aria-disabled'), document.querySelector('[data-xextra=\"ts:1\"] .xnote').innerText.trim()];");
  check("ติ๊กแทร็กแล้ว แถวเวลากดได้ บอกจำนวนแทร็ก", tsOn[0] === null && tsOn[1] === "ของแทร็กที่ติ๊ก 2 แทร็ก ไฟล์ละแทร็ก", tsOn.join(" | "));
  await q("['tags:1', 'ogm:1', 'cue:1', 'ts:1'].forEach((k) => document.querySelector(`[data-xpick=\"${k}\"]`).click()); return 1;"); await sleep(200);
  const picked = await q("return document.querySelector('[data-extract] .xpicks b')?.innerText.trim() ?? ''");
  check("ชิ้นที่เลือกนับเวลาของแต่ละเฟรมแยกต่อแทร็ก รวม 7 อย่าง", picked === "เลือกไว้ 7 อย่าง", picked);
  await c.shot(`${SHOT}/02-แถวแยกแบบใหม่.png`, "[data-pageslot=av] .card:has([data-xextra])", 8);
  const row = await q("const x = document.querySelector('.xbatch').getBoundingClientRect(), d = document.querySelector('[data-extract-dest]').getBoundingClientRect(), s = document.querySelector('[data-extract-start]').getBoundingClientRect(), bar = document.querySelector('[data-extract]').getBoundingClientRect(); return { sameRow: Math.abs(x.top + x.height / 2 - (s.top + s.height / 2)) < 4, order: x.right <= d.left + 1 && d.right <= s.left + 1, inBar: s.right <= bar.right + 1, h: Math.round(bar.height) };");
  check("ปุ่มหลายไฟล์อยู่แถวเดียวกับที่เก็บและปุ่มแยก ไม่ล้นแถบล่าง", row.sameRow && row.order && row.inBar, JSON.stringify(row));
  await c.shot(`${SHOT}/03-แถบล่าง-หลายไฟล์.png`, "[data-extract]", 6);
  await click("[data-extract-start]");
  check("แยกครบ 7 ไฟล์", await waitFor("return (document.querySelector('[data-extract]')?.innerText ?? '').includes('แยกครบ 7 ไฟล์')", 60000), await q("return document.querySelector('[data-extract]')?.innerText.replace(/\\s+/g, ' ') ?? ''"));
  const out = folderOf(MOVIE);
  const got = ls(out);
  const want = ["Audio1 - th - ดาวเหนือ (2023).aac", "Text2 - en - ดาวเหนือ (2023).ass", "ดาวเหนือ (2023).tags.xml", "ดาวเหนือ (2023).chapters.txt", "ดาวเหนือ (2023).cue", "Audio1 - th - ดาวเหนือ (2023).timestamps.txt", "Text2 - en - ดาวเหนือ (2023).timestamps.txt"].sort();
  check("ชื่อไฟล์ตามรูปแบบที่ตั้ง ตรงกับตัวอย่างในหน้าตั้งค่า", JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
  const rd = (n) => existsSync(`${out}/${n}`) ? readFileSync(`${out}/${n}`, "utf8") : "";
  check("แท็กเป็น XML ของ Matroska", rd("ดาวเหนือ (2023).tags.xml").includes("<Tags>"));
  check("Chapter แบบ OGM มี CHAPTER01= และ CHAPTER01NAME=", /CHAPTER01=\d\d:\d\d:\d\d\.\d{3}/.test(rd("ดาวเหนือ (2023).chapters.txt")) && rd("ดาวเหนือ (2023).chapters.txt").includes("CHAPTER01NAME="));
  // หนังทดสอบไม่มีแท็กเวลาของแต่ละ Chapter mkvextract จึงเขียนแค่รายชื่อเพลงตาม Chapter ไม่มี INDEX (คำอธิบายใน ⓘ บอกไว้)
  const cue = rd("ดาวเหนือ (2023).cue");
  check("CUE sheet ชี้ไฟล์หนังและมีเพลงครบ 3 รายการตาม Chapter", cue.includes("ดาวเหนือ (2023).mkv") && (cue.match(/TRACK \d\d AUDIO/g) ?? []).length === 3, cue.replace(/\s+/g, " ").slice(0, 160));
  check("เวลาของแต่ละเฟรมเป็นแบบ v2 มีเวลาหลายบรรทัด", /format v2/.test(rd("Audio1 - th - ดาวเหนือ (2023).timestamps.txt")) && rd("Audio1 - th - ดาวเหนือ (2023).timestamps.txt").split("\n").length > 10);
  await c.shot(`${SHOT}/04-แยกเสร็จ.png`, "[data-extract]", 6);
  await q("[...document.querySelectorAll('[data-extract] button')].find((b) => b.innerText === 'แยกอย่างอื่นต่อ')?.click(); return 1;"); await sleep(300);

  /* ---------------------------------------------------------------- แยกหลายไฟล์ */
  await q(`window.__extractFiles = ${JSON.stringify([LATE, OTHER])}; return 1;`);
  await click("[data-extract-batch]");
  check("แยกหลายไฟล์ ทีละไฟล์จนครบสองไฟล์", await waitFor("return !!document.querySelector('[data-batch-close]')", 90000), await q("return document.querySelector('[data-extract-batchrun]')?.innerText.replace(/\\s+/g, ' ') ?? ''"));
  const br = await q("return [...document.querySelectorAll('[data-batch-row]')].map((r) => r.innerText.replace(/\\s+/g, ' ').trim())");
  check("ไฟล์แรกแยกครบ 7 ไฟล์ ไฟล์ที่สองบอกจำนวนชิ้นที่ไฟล์นั้นไม่มี", br.length === 2 && br[0].endsWith("แยกแล้ว 7 ไฟล์") && /แยกแล้ว \d+ ไฟล์ และไฟล์นี้ไม่มี \d+ อย่าง$/.test(br[1]), JSON.stringify(br));
  await c.shot(`${SHOT}/05-แยกหลายไฟล์.png`, "[data-extract-batchrun]", 6);
  const late = ls(folderOf(LATE));
  check("เสียงที่ช้ากว่าภาพ 120 มิลลิวินาที ชื่อไฟล์มี DELAY 120ms ตรงตัวแทน {Delay}", late.includes("Audio1 DELAY 120ms - th - เสียงช้า (2023).aac"), JSON.stringify(late));
  check("ไฟล์ที่ไม่มีภาษาไม่ทิ้งเว้นวรรคซ้อน", !ls(folderOf(OTHER)).some((f) => f.includes("  ")), JSON.stringify(ls(folderOf(OTHER))));
  const oth = ls(folderOf(OTHER));
  check("ไฟล์ที่สอง นามสกุลตามเสียงของไฟล์นั้น (Vorbis เป็น .ogg) ไม่ใช้ของเรื่องแรก", oth.some((f) => /^Audio1 .*\.ogg$/.test(f)), JSON.stringify(oth));
  // ดีเลย์ในชื่อ หน้าเสียงและซับอ่านกลับเป็นดีเลย์ของแทร็ก
  const back = await inv("merge_add_file", { path: `${folderOf(LATE)}/Audio1 DELAY 120ms - th - เสียงช้า (2023).aac`, movieDuration: null, view: null }).catch((e) => ({ delayFromName: String(e) }));
  check("เพิ่มไฟล์เสียงที่แยกได้กลับเข้าหน้าเสียงและซับ อ่านดีเลย์ 120 จากชื่อ", back.delayFromName === 120, String(back.delayFromName));
  await click("[data-batch-close]"); await sleep(300);

  /* ---------------------------------------------------------------- ไฟล์ที่ไม่ใช่ MKV ไม่มีแถวใหม่ */
  await q(`window.__avDrop([${JSON.stringify(`${SRC}/The Last Orchard (2022).mp4`)}], 400, 300); return 1;`);
  await waitFor("return (document.querySelector('[data-movie-chip]')?.innerText ?? '').includes('Orchard')", 20000); await sleep(1500);
  check("ไฟล์ MP4 ไม่มีแถวแยกแบบใหม่และไม่มีปุ่มหลายไฟล์", await q("return !document.querySelector('[data-xextra]') && !document.querySelector('[data-extract-batch]')"));
} finally {
  await q("delete window.__extractFiles; return 1;").catch(() => {});
  await inv("set_settings", { patch: { extractPattern: pat0 } });
  await q("location.reload(); return 1;").catch(() => {}); await sleep(3000);
}
const s2 = (await inv("get_settings")).settings;
check("คืนรูปแบบชื่อเดิมตอนจบ", s2.extractPattern === pat0, s2.extractPattern);
rmSync(TMP, { recursive: true, force: true });
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length} ข้อ · ภาพอยู่ ${SHOT}`);
process.exit(ok === results.length ? 0 : 1);
