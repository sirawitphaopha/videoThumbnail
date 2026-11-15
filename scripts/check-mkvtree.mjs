// BUGS ข้อ 131 โครงสร้างไฟล์ MKV แบบ mkvinfo ในหน้าข้อมูลไฟล์ (MediaInfo) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-mkvtree.mjs
// ไฟล์ทดสอบเปิดอ่านอย่างเดียว เทียบ hash ก่อนและหลัง · ค่าในต้นไม้เทียบกับ mkvmerge -J ของไฟล์เดียวกัน · ตอนพี่กันทำงานอยู่ส่ง NOGATE=1
import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";
import { linesOf } from "./lib/lines.mjs";

// จุดตัดบรรทัดของกล่อง ⓘ ทุกกล่องที่อ่านแล้วว่าตัดตรงความหมาย (DUMP=1 พิมพ์ของจริงออกมาเทียบ) · แก้คำอธิบายใน MkvTree.tsx ต้องอ่านแล้วแก้ตารางนี้ด้วย
const WANT_TIPS = {
  "EBML":"หัวไฟล์ บอกว่าไฟล์นี้เขียนแบบ EBML และเป็นชนิดไหน (DocType) ⏎ โปรแกรมเล่นอ่านส่วนนี้ก่อนเพื่อรู้ว่าเปิดไฟล์ได้ไหม",
  "DocType":"matroska คือไฟล์ MKV MKA MKS ส่วน webm คือไฟล์ WebM",
  "DocTypeVersion":"รุ่นของมาตรฐาน Matroska ที่ไฟล์ใช้ ⏎ โดยโปรแกรมเล่นต้องรองรับรุ่นตาม DocTypeReadVersion",
  "Segment":"กล่องใหญ่ที่เก็บทุกอย่างของหนัง ⏎ ทั้งแทร็ก Chapter แท็ก และภาพเสียง โดยไฟล์ปกติมี Segment เดียว",
  "SeekHead":"สารบัญของไฟล์ บอกว่าส่วนสำคัญแต่ละส่วนอยู่ที่ไบต์ไหน ⏎ โปรแกรมเล่นจึงกระโดดไปอ่านได้เลยโดยไม่ต้องไล่อ่านทั้งไฟล์",
  "CRC-32":"ค่าตรวจความถูกต้องของชั้นนี้ ใช้รู้ว่าข้อมูลส่วนนี้เสียหรือไม่",
  "Seek":"หนึ่งบรรทัดในสารบัญ บอกชื่อส่วนใน SeekID ⏎ กับตำแหน่งนับจากต้น Segment ใน SeekPosition",
  "Void":"ที่ว่างที่จองไว้ ให้โปรแกรมแก้ข้อมูลข้างหน้าได้ ⏎ โดยไม่ต้องเขียนไฟล์ใหม่ทั้งไฟล์",
  "Info":"ข้อมูลของเรื่อง เช่นความยาว ชื่อเรื่อง และโปรแกรมที่ทำไฟล์",
  "TimestampScale":"หน่วยของเวลาในไฟล์ นาโนวินาทีต่อหนึ่งหน่วย ⏎ ค่า 1,000,000 แปลว่าเวลาในไฟล์นับเป็นมิลลิวินาที",
  "Title":"ชื่อเรื่องที่ตั้งไว้ในไฟล์ ซึ่งโปรแกรมเล่นบางตัวแสดงแทนชื่อไฟล์",
  "MuxingApp":"ไลบรารีที่ใช้เขียนไฟล์ ⏎ เช่น libebml กับ libmatroska ของ MKVToolNix",
  "WritingApp":"โปรแกรมที่ทำไฟล์นี้พร้อมรุ่น ⏎ เช่น mkvmerge หรือ Lavf ซึ่งเป็นตัวเขียนไฟล์ของ ffmpeg",
  "SegmentUUID":"รหัสประจำไฟล์แบบสุ่ม ใช้ตอนไฟล์หลายไฟล์ต่อกันเป็นเรื่องเดียว",
  "Duration":"ความยาวของเรื่องเป็นหน่วยตาม TimestampScale ⏎ โดยในวงเล็บแปลงเป็นเวลาให้แล้ว",
  "Tracks":"รายการแทร็กทั้งหมดในไฟล์ ทั้งภาพ เสียง และซับ",
  "TrackEntry":"ข้อมูลของหนึ่งแทร็ก เช่นชนิด codec ภาษา และค่าตั้งต้น",
  "TrackNumber":"เลขแทร็กที่ก้อนข้อมูลใน Cluster ใช้อ้าง เริ่มที่ 1 ⏎ ซึ่งต่างจากเลขของ mkvmerge ที่เริ่มที่ 0",
  "TrackUID":"รหัสประจำแทร็กแบบสุ่ม ใช้ให้แท็กกับ Chapter อ้างถึงแทร็กนี้",
  "FlagLacing":"1 คืออนุญาตให้รวมหลายเฟรมไว้ในก้อนเดียว ⏎ ซึ่งช่วยให้ไฟล์เสียงเล็กลงเล็กน้อย",
  "Language":"ภาษาของแทร็กแบบรหัสสามตัว เช่น tha eng ส่วน und คือไม่ระบุ",
  "FlagDefault":"1 คือแทร็กหลักที่โปรแกรมเล่นเลือกให้เองเมื่อผู้ดูไม่ได้เลือก",
  "CodecID":"ชนิดข้อมูลของแทร็กตามแบบ Matroska ⏎ เช่น V_MPEG4/ISO/AVC คือภาพ H.264 และ A_AC3 คือเสียง AC-3",
  "TrackType":"ชนิดแทร็ก 1 คือภาพ 2 คือเสียง และ 17 คือซับ",
  "DefaultDuration":"ความยาวของหนึ่งเฟรมเป็นนาโนวินาที ⏎ โดยในวงเล็บแปลงเป็นจำนวนเฟรมต่อวินาทีให้แล้ว",
  "Video":"ข้อมูลของภาพ เช่นขนาดเป็นพิกเซล ขนาดที่แสดง และสี",
  "PixelWidth":"ความกว้างของภาพที่เก็บจริงเป็นพิกเซล",
  "PixelHeight":"ความสูงของภาพที่เก็บจริงเป็นพิกเซล",
  "Colour":"ข้อมูลสีของภาพ เช่นช่วงสีและแบบแปลงสี ซึ่งภาพ HDR ต้องมีส่วนนี้",
  "CodecPrivate":"ข้อมูลตั้งต้นที่ตัวถอดต้องใช้ก่อนเริ่ม เช่นค่าตั้งของภาพ H.264 ⏎ หรือหัวไฟล์ซับ ASS ที่มีสไตล์",
  "CodecDelay":"ดีเลย์ของตัวถอดเสียงเป็นนาโนวินาที ⏎ ซึ่งเสียง Opus ใช้บอกให้ตัดเสียงเงียบตอนต้น",
  "Audio":"ข้อมูลของเสียง เช่นอัตราสุ่ม จำนวนช่อง และความลึกบิต",
  "Channels":"จำนวนช่องเสียง 2 คือสเตอริโอ ส่วน 6 คือ 5.1",
  "SamplingFrequency":"อัตราสุ่มเสียงเป็นเฮิรตซ์ เช่น 48000 คือ 48 kHz",
  "BitDepth":"ความลึกบิตของเสียง เช่น 16 หรือ 24 บิต ⏎ ซึ่งเสียงที่บีบอัดแบบเสียคุณภาพมักไม่มีค่านี้",
  "Chapters":"Chapter ของเรื่อง แบ่งเป็นตอนพร้อมชื่อและเวลาเริ่ม",
  "EditionEntry":"ชุด Chapter หนึ่งชุด ซึ่งไฟล์ส่วนใหญ่มีชุดเดียว ⏎ ส่วนแผ่นบางแผ่นมีหลายชุดให้เลือก",
  "ChapterAtom":"Chapter หนึ่งตอน มีเวลาเริ่ม เวลาจบ และชื่อ",
  "ChapterTimeStart":"เวลาเริ่มของ Chapter นี้",
  "ChapterTimeEnd":"เวลาจบของ Chapter นี้ ซึ่งไม่ใส่ก็ได้ ⏎ โดยโปรแกรมเล่นถือว่าจบตอน Chapter ถัดไปเริ่ม",
  "ChapterDisplay":"ชื่อที่แสดงของ Chapter แยกตามภาษา",
  "ChapString":"ชื่อ Chapter ที่โปรแกรมเล่นแสดงในรายการตอน",
  "Tags":"แท็กของไฟล์ เช่นชื่อเรื่อง ปี หรือข้อมูลของแต่ละแทร็ก ⏎ ซึ่งแยกเป็น XML ได้ในหน้าเสียงและซับ",
  "Tag":"แท็กหนึ่งชุด มี Targets บอกว่าเป็นของทั้งเรื่องหรือของแทร็กไหน",
  "Targets":"บอกว่าแท็กชุดนี้เป็นของอะไร ⏎ ถ้ามี TagTrackUID คือของแทร็กนั้น ถ้าไม่มีคือของทั้งเรื่อง",
  "SimpleTag":"แท็กหนึ่งค่า ⏎ เช่น TagName เป็น BPS กับ TagString เป็นตัวเลขบิตเรต",
  "TagName":"ชื่อแท็ก เช่น TITLE หรือ BPS ⏎ ซึ่ง mkvmerge ใส่สถิติของแทร็กเป็นแท็กพวกนี้",
  "TagString":"ค่าของแท็กเป็นข้อความ",
  "Cluster":"ก้อนข้อมูลภาพและเสียงจริง แต่ละก้อนยาวไม่กี่วินาที ⏎ โปรแกรมแสดงแค่สามก้อนแรก แล้วนับจำนวนที่เหลือให้",
  "Timestamp":"เวลาเริ่มของ Cluster นี้ เวลาของแต่ละก้อนข้างในนับต่อจากค่านี้",
  "SimpleBlock":"ข้อมูลเฟรมของแทร็กเดียว บอกเลขแทร็กและเวลานับจาก Cluster ⏎ ส่วน keyframe คือเฟรมที่กระโดดมาเล่นได้เลย",
  "BlockGroup":"ก้อนข้อมูลแบบเก่าที่มีข้อมูลเพิ่ม ⏎ เช่นความยาวของซับใน BlockDuration",
  "BlockDuration":"ความยาวของก้อนนี้ ซึ่งซับใช้บอกว่าข้อความขึ้นนานเท่าไหร่",
  "Cues":"สารบัญกระโดด บอกว่าแต่ละช่วงเวลาอยู่ที่ไบต์ไหน ⏎ ทำให้ลากแถบเวลาแล้วภาพมาเร็ว ไม่มีส่วนนี้การกรอจะช้า",
  "CuePoint":"หนึ่งจุดในสารบัญกระโดด ⏎ มีเวลาใน CueTime กับตำแหน่งของ Cluster",
  "CueTime":"เวลาของจุดนี้เป็นหน่วยตาม TimestampScale ⏎ โดยในวงเล็บแปลงเป็นเวลาให้แล้ว",
  "CueClusterPosition":"ตำแหน่งของ Cluster ที่มีเฟรมนี้ นับจากต้น Segment"
};

const NOGATE = process.env.NOGATE === "1";
const gate = () => { if (NOGATE) return; try { execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/fg-gate.ps1"], { stdio: "ignore" }); } catch { console.log("หน้าต่างชั้นหนังอยู่หน้าสุดของจอ หยุดตรวจ"); process.exit(2); } };
gate();
const MOVIE = "D:/movie-shelf/test-media/สร้าง/หนัง/ดาวเหนือ (2023).mkv";
const MP4 = "D:/movie-shelf/test-media/สร้าง/หนัง/The Last Orchard (2022).mp4";
const SHOT = "docs/report-2026-11-15/โครงสร้างMKV";
mkdirSync(SHOT, { recursive: true });
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");
const before = sha(MOVIE);
const J = JSON.parse(execFileSync("D:/movie-shelf/src-tauri/tools/mkvmerge.exe", ["-J", MOVIE]).toString());

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click(); return 1;`);
const click = async (sel) => { gate(); await c.click(sel); };
const rows = () => q("return [...document.querySelectorAll('[data-mkt]')].map((r) => ({ n: r.getAttribute('data-mkt'), v: r.querySelector('[data-mkt-val]')?.innerText ?? null, p: r.getAttribute('data-mkt-path') }))");

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await nav("MediaInfo"); await sleep(400);
await q(`window.__miOpen(${JSON.stringify(MOVIE)}); return 1;`);
check("หน้าข้อมูลไฟล์ MKV มีการ์ดโครงสร้างไฟล์ MKV ปุ่มอ่านโครงสร้าง ยังไม่อ่านเอง", await waitFor("return !!document.querySelector('[data-mkvtree-load]') && !document.querySelector('[data-mkvtree-root]')", 20000));
const hint = (await linesOf(q, "[data-mkvtree] .minirow .small"))?.[0] ?? "";
check("คำอธิบายข้างปุ่มไม่ตกบรรทัดจนถ่าง", hint && (!hint.includes("⏎") || hint.split(" ⏎ ").at(-1).length > 12), hint);
await c.shot(`${SHOT}/01-การ์ดก่อนอ่าน.png`, "[data-mkvtree]", 8);
await click("[data-mkvtree-load]");
check("กดแล้วอ่านโครงสร้างเสร็จ", await waitFor("return !!document.querySelector('[data-mkvtree-root]')", 30000), await q("return document.querySelector('[data-mkvtree-err]')?.innerText ?? ''"));
let r = await rows();
const top = r.filter((x) => x.p.split("/").length === 2).map((x) => x.n);
check("ชั้นบนสุดเป็น EBML กับ Segment", JSON.stringify(top) === JSON.stringify(["EBML", "Segment"]), JSON.stringify(top));
const val = (n) => r.find((x) => x.n === n)?.v ?? null;
check("DocType เป็น matroska", val("DocType") === "matroska", String(val("DocType")));
const durMs = Math.round(J.container.properties.duration / 1e6);
const durTxt = `${Math.floor(durMs / 3600000)}:${String(Math.floor(durMs / 60000) % 60).padStart(2, "0")}:${String(Math.floor(durMs / 1000) % 60).padStart(2, "0")}.${String(durMs % 1000).padStart(3, "0")}`;
check("Duration ตรงกับ mkvmerge -J", (val("Duration") ?? "").endsWith(`(${durTxt})`), `${val("Duration")} เทียบ ${durTxt}`);
check("เปิดมากาง Info กับ Tracks ไว้ เห็น TrackEntry ครบตามจำนวนแทร็ก", r.filter((x) => x.n === "TrackEntry").length === J.tracks.length, String(r.filter((x) => x.n === "TrackEntry").length));
check("Chapters กับ Cluster ยังพับไว้", !r.some((x) => x.n === "ChapterAtom") && !r.some((x) => x.n === "SimpleBlock"));
await c.shot(`${SHOT}/02-เปิดมา.png`, "[data-mkvtree]", 8);
// กางทั้งหมด
await click("[data-mkt-all]"); await sleep(400);
r = await rows();
const codecs = r.filter((x) => x.n === "CodecID").map((x) => x.v);
check("CodecID ทุกแทร็กตรงกับ mkvmerge -J", JSON.stringify(codecs) === JSON.stringify(J.tracks.map((t) => t.properties.codec_id)), JSON.stringify(codecs));
check("Chapter ครบตาม mkvmerge -J", r.filter((x) => x.n === "ChapterAtom").length === J.chapters[0].num_entries, String(r.filter((x) => x.n === "ChapterAtom").length));
const sb = r.find((x) => x.n === "SimpleBlock" && x.v?.startsWith("แทร็ก"));
check("ก้อนข้อมูลบอกเลขแทร็ก เวลา และ keyframe", !!sb && /^แทร็ก \d+ เวลา [+-]\d+/.test(sb.v), sb?.v ?? "");
const tt = r.filter((x) => x.n === "TrackType").map((x) => x.v);
check("TrackType บอกชนิดเป็นคำ", tt[0] === "1 video" && tt.includes("2 audio") && tt.includes("17 subtitle"), JSON.stringify(tt));
// ⓘ ของชั้นสำคัญ
const tips = await q("return [...document.querySelectorAll('[data-mkt]')].filter((r) => ['EBML', 'Segment', 'SeekHead', 'Info', 'Tracks', 'TrackEntry', 'CodecID', 'Chapters', 'Tags', 'Cues', 'Cluster', 'SimpleBlock'].includes(r.getAttribute('data-mkt'))).map((r) => [r.getAttribute('data-mkt'), !!r.querySelector('[data-info]')])");
check("ชั้นสำคัญทุกชั้นมีปุ่ม ⓘ", tips.length >= 12 && tips.every((x) => x[1]), JSON.stringify(tips.filter((x) => !x[1])));
// อ่านจุดตัดบรรทัดของกล่อง ⓘ ทุกกล่องที่เห็น ไม่มีบรรทัดท้ายเหลือคำโดด
const names = [...new Set((await rows()).map((x) => x.n))];
const bad = [];
for (const n of names) {
  const has = await q(`const r = [...document.querySelectorAll('[data-mkt]')].find((x) => x.getAttribute('data-mkt') === ${JSON.stringify(n)}); const b = r?.querySelector('[data-info]'); if (!b) return false; document.querySelectorAll('[data-tipnow]').forEach((x) => x.removeAttribute('data-tipnow')); b.setAttribute('data-tipnow', ''); return true;`);
  if (!has) continue;
  await click("[data-tipnow]"); await sleep(120);
  const l = (await linesOf(q, ".infotip .tw"))?.[0] ?? "";
  if (process.env.DUMP) console.log(`   ${n} | ${l}`);
  if (!process.env.DUMP && WANT_TIPS[n] !== l) bad.push(`${n}: ${l}`);
  await c.key("Escape"); await sleep(60);
}
check(`คำอธิบายทุกกล่องตัดบรรทัดตรงที่อ่านไว้ (${Object.keys(WANT_TIPS).length} กล่อง)`, bad.length === 0 && names.filter((n) => WANT_TIPS[n]).length === Object.keys(WANT_TIPS).length, JSON.stringify(bad));
// พับทั้งหมด แล้วกดลูกศรกาง Segment ทีละชั้น
await click("[data-mkt-none]"); await sleep(200);
check("พับทั้งหมดเหลือแค่ชั้นบนสุด", (await rows()).length === 2, String((await rows()).length));
await click('[data-mkt-toggle="r/1"]'); await sleep(200);
check("กดลูกศรของ Segment กางชั้นใต้ Segment", (await rows()).some((x) => x.n === "Info") && (await q("return document.querySelector('[data-mkt-toggle=\"r/1\"]').getAttribute('aria-expanded')")) === "true");
await click("[data-mkt-all]"); await sleep(300);
const over = await q("const m = document.querySelector('[data-mkvtree-root]'); return [m.scrollWidth - m.clientWidth, [...document.querySelectorAll('.mkt-row')].filter((r) => r.scrollWidth > r.clientWidth + 1).length];");
check("ไม่มีแถวล้นขวา", over[0] <= 1 && over[1] === 0, JSON.stringify(over));
await q("document.querySelector('[data-mkvtree-root]').scrollTop = 0; return 1;");
await c.shot(`${SHOT}/03-กางทั้งหมด.png`, "[data-mkvtree]", 8);
await q("const r = [...document.querySelectorAll('[data-mkt]')].find((x) => x.getAttribute('data-mkt') === 'Cluster'); r?.scrollIntoView({ block: 'center' }); return 1;"); await sleep(200);
await c.shot(`${SHOT}/04-ก้อนข้อมูล.png`, "[data-mkvtree]", 8);
check("ไฟล์หนังไม่ถูกแตะ", sha(MOVIE) === before);
// ไฟล์ที่ไม่ใช่ MKV ไม่มีการ์ด
await q("[...document.querySelectorAll('[data-info-page] button')].find((b) => b.innerText.includes('เลือกไฟล์อื่น'))?.click(); return 1;"); await sleep(400);
await q(`window.__miOpen(${JSON.stringify(MP4)}); return 1;`);
await waitFor("return !!document.querySelector('[data-mi]')", 20000);
check("ไฟล์ MP4 ไม่มีการ์ดโครงสร้าง MKV", !(await q("return !!document.querySelector('[data-mkvtree]')")));
await q("[...document.querySelectorAll('[data-info-page] button')].find((b) => b.innerText.includes('เลือกไฟล์อื่น'))?.click(); return 1;");
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length} ข้อ · ภาพอยู่ ${SHOT}`);
process.exit(ok === results.length ? 0 : 1);
