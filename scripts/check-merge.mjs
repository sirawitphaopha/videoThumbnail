// เทสคำสั่งรวมไฟล์ของหน้าเสียงและซับ (แผนเสียงและซับ ขั้น 1) ในโปรแกรมจริง ผ่านพอร์ตดีบัก
// เรียกคำสั่งตรงแบบที่หน้าจอจะเรียก (merge_inspect merge_add_file merge_apply merge_cancel) แล้วเช็กผลด้วย mkvmerge ffprobe และค่า hash
// ไฟล์หนังเป็นสำเนาในโฟลเดอร์ทดสอบ ไม่แตะ test-media · ไฟล์เสียงซับที่เพิ่มอ่านจาก test-media ตรง (อ่านอย่างเดียว)
// ใช้: node scripts/check-merge.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1 · ไฟล์ทดสอบจาก node scripts/make-test-media.mjs)
import { mkdirSync, writeFileSync, readdirSync, copyFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const ROOT = process.cwd();
const AV = join(ROOT, "test-media", "สร้าง", "เสียงซับ");
const T = join(ROOT, "src-tauri", "tools");
const DIR = "D:\\dev\\tmp\\ชั้นเสียงซับ";
const OUT = "docs/report-2026-11-07/เสียงซับ-ขั้น1";
mkdirSync(OUT, { recursive: true });
if (!existsSync(join(AV, "ดาวตก (2024).mkv"))) { console.log("ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน"); process.exit(1); }

const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const tool = (name, args) => spawnSync(join(T, name + ".exe"), args, { encoding: "utf8", maxBuffer: 64 << 20 });
const ident = (p) => JSON.parse(tool("mkvmerge", ["-J", p]).stdout || "{}");
const partials = () => readdirSync(DIR).filter((f) => f.endsWith(".partial"));

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const invTry = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }))`);
async function waitScan() {
  await sleep(300);
  for (let i = 0; i < 300; i++) {
    const r = await inv("get_library");
    if (!r.scanning) return r;
    await sleep(200);
  }
  throw new Error("รออ่านโฟลเดอร์เกินเวลา");
}
// ฟังเหตุการณ์ความคืบหน้า merge-progress เก็บไว้ในหน้าต่าง
await c.evaluate(`(() => {
  window.__mergeEvents = [];
  // กดหยุดจากในหน้าต่างทันทีที่ขั้นที่ตั้งไว้เริ่ม ไม่ต้องรอรอบของพอร์ตดีบัก (ไฟล์ทดสอบเล็ก รวมเสร็จในไม่กี่ร้อยมิลลิวินาที)
  window.__cancelOn = null;
  const cb = window.__TAURI_INTERNALS__.transformCallback((e) => {
    window.__mergeEvents.push(e.payload);
    if (window.__cancelOn && e.payload.phase === window.__cancelOn) { window.__cancelOn = null; window.__TAURI_INTERNALS__.invoke("merge_cancel"); }
  });
  return window.__TAURI_INTERNALS__.invoke("plugin:event|listen", { event: "merge-progress", target: { kind: "Any" }, handler: cb });
})()`);

// ---------- โฟลเดอร์ทดสอบ ----------
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
for (const f of ["ดาวตก (2024).mkv", "ซับรูป (2024).mkv"]) copyFileSync(join(AV, f), join(DIR, f));
const MOVIE = join(DIR, "ดาวตก (2024).mkv");
const h0 = sha(MOVIE);
const srcBefore = Object.fromEntries(readdirSync(AV).map((f) => [f, sha(join(AV, f))]));
await inv("dev_fake_free", { bytes: 0 });
await inv("set_settings", { patch: { folders: [DIR], originalAfter: "keep", checkSourceBefore: true, checkOutputAfter: true } });
await inv("scan_library");
await waitScan();

// ---------- เปิดหนัง · เพิ่มไฟล์ ----------
const m = await inv("merge_inspect", { path: MOVIE });
check("เปิดหนัง ภาพ 1 เสียงอังกฤษ 1 ยาว 60 วินาที ทำ MP4 ได้", m.tracks.length === 2 && m.tracks[1].lang === "eng" && Math.abs(m.duration - 60) < 0.1 && m.mp4Ok, `${m.tracks.map((t) => `${t.kind}:${t.codec}:${t.lang}`).join(" ")} · ${m.duration}`);
const dub = await inv("merge_add_file", { path: join(AV, "ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3"), movieDuration: m.duration });
check("เพิ่มพากย์ไทย อ่านดีเลย์ −120 ms จากชื่อ เดาภาษาไทย 5.1 ช่อง", dub.delayFromName === -120 && dub.langFromName === "tha" && dub.tracks[0].delay === -120 && dub.tracks[0].channels === 6, JSON.stringify({ d: dub.delayFromName, l: dub.langFromName, ch: dub.tracks[0].channels, longer: dub.longerBy }));
const th = await inv("merge_add_file", { path: join(AV, "ดาวตก (2024).th.srt"), movieDuration: m.duration });
const tis = await inv("merge_add_file", { path: join(AV, "ดาวตก (2024).tis620.th.srt"), movieDuration: m.duration });
const vtt = await inv("merge_add_file", { path: join(AV, "ดาวตก (2024).en.vtt"), movieDuration: m.duration });
check("เพิ่มซับ SRT UTF-8 · SRT TIS-620 (บอกว่าแปลงให้) · VTT อังกฤษ", th.tracks[0].charset === "UTF-8" && tis.tracks[0].charset === "CP874" && tis.notes.some((n) => n.includes("TIS-620")) && vtt.tracks[0].lang === "eng" && th.tracks[0].frames === 3,
  `${th.tracks[0].charset} · ${tis.tracks[0].charset} · ${vtt.tracks[0].codec}:${vtt.tracks[0].lang} · บรรทัด ${th.tracks[0].frames}`);
const bad = await invTry("merge_add_file", { path: join(ROOT, "test-media", "สร้าง", "รูป", "poster.jpg"), movieDuration: m.duration });
check("เพิ่มไฟล์ที่ไม่ใช่เสียงหรือซับ บอกว่าใช้ไม่ได้", !bad.ok, bad.e);

// ---------- รวมเป็น MKV ----------
const v = m.tracks[0], eng = { ...m.tracks[1] };
const d = { ...dub.tracks[0], name: "พากย์ไทย 5.1", default: true };
const s1 = { ...th.tracks[0], name: "ไทย", default: true, delay: 500 };
const s2 = { ...tis.tracks[0] };
const s3 = { ...vtt.tracks[0] };
const order = [v, d, eng, s1, s2, s3];
const req = (tracks, extra = {}) => ({ req: { movie: MOVIE, tracks, covers: { portrait: "keep", land: "keep" }, output: "mkv", original: "keep", checkSource: true, checkOutput: true, ...extra } });
await c.evaluate("window.__mergeEvents = []");
const r1 = await invTry("merge_apply", req(order));
const ev = await c.evaluate("window.__mergeEvents");
check("รวมเสร็จ ตรวจผ่าน ภาพ 1 เสียง 2 ซับ 3", r1.ok && r1.r.verified && r1.r.counts.video === 1 && r1.r.counts.audio === 2 && r1.r.counts.subs === 3, r1.ok ? JSON.stringify(r1.r.counts) : JSON.stringify(r1.e));
const phases = [...new Set(ev.map((e) => e.phase))];
check("ส่งความคืบหน้า ตรวจไฟล์ต้นทาง → รวมเข้าไฟล์ใหม่ → ตรวจไฟล์ใหม่ ถึง 100%", phases.includes("กำลังตรวจไฟล์ต้นทาง") && phases.includes("กำลังรวมเข้าไฟล์ใหม่") && phases.includes("กำลังตรวจไฟล์ใหม่") && ev.some((e) => e.phase === "กำลังรวมเข้าไฟล์ใหม่" && e.percent === 100), `${phases.join(" → ")} · ${ev.length} ครั้ง`);
if (r1.ok) {
  const out = r1.r.output;
  const j = ident(out);
  const got = j.tracks.map((t) => `${t.codec}|${t.properties.language}|${t.properties.track_name ?? ""}|${t.properties.default_track ? 1 : 0}`);
  check("ลำดับ ภาพ พากย์ไทย อังกฤษ ซับไทย ซับไทยเก่า ซับอังกฤษ · ภาษา ชื่อ หลัก ตรงที่ตั้ง", got[1] === "AC-3|tha|พากย์ไทย 5.1|1" && got[2] === "AAC|eng|English|0" && got[3] === "SubRip/SRT|tha|ไทย|1" && got[4] === "SubRip/SRT|tha||0" && got[5] === "SubRip/SRT|eng||0", got.join(" · "));
  check("ซับ VTT แปลงเป็น SRT ก่อนใส่ MKV และบอกในผล", r1.r.notes.some((n) => n.includes("แปลงเป็น SRT")), r1.r.notes.join(" · "));
  const subs = tool("ffprobe", ["-v", "error", "-select_streams", "s:0", "-show_entries", "packet=pts_time", "-of", "csv=p=0", out]).stdout.trim().split(/\r?\n/)[0];
  check("ซับไทยดีเลย์ +500 ms บรรทัดแรกจาก 1.0 เป็น 1.5 วินาที", Math.abs(parseFloat(subs) - 1.5) < 0.005, subs);
  const txt = tool("ffmpeg", ["-v", "error", "-i", out, "-map", "0:s:1", "-f", "srt", "-"]).stdout;
  check("ซับ TIS-620 ในไฟล์ใหม่อ่านเป็นภาษาไทยถูก", txt.includes("สวัสดีค่ะ นี่คือซับไตเติลภาษาไทย"), txt.split(/\r?\n/)[2]);
  check("ไฟล์เดิมย้ายไปโฟลเดอร์ไฟล์เดิม hash เท่าก่อนรวม · ไฟล์ใหม่ชื่อเดิม", r1.r.original === "kept" && r1.r.originalTo === join(DIR, "ไฟล์เดิม", "ดาวตก (2024).mkv") && sha(r1.r.originalTo) === h0 && out === MOVIE, `${r1.r.original} · ${r1.r.originalTo}`);
  const lib = await waitScan();
  const paths = (lib.movies ?? lib.items ?? []).map((x) => x.path);
  check("คลังหนังเห็นไฟล์ใหม่ ไม่เห็นไฟล์เดิมที่ย้ายไป", paths.includes(MOVIE) && !paths.some((p) => p.includes("ไฟล์เดิม")), `${paths.length} เรื่อง`);
}

// ---------- MP4 มีซับรูป ต้องไม่เริ่ม ----------
const img = join(DIR, "ซับรูป (2024).mkv");
const hImg = sha(img);
const mi = await inv("merge_inspect", { path: img });
const r2 = await invTry("merge_apply", { req: { movie: img, tracks: mi.tracks, covers: { portrait: "keep", land: "keep" }, output: "mp4", original: "keep", checkSource: false, checkOutput: true } });
check("ทำ MP4 ทั้งที่มีซับรูป ไม่เริ่ม บอกแทร็กที่ใส่ไม่ได้ ไฟล์ไม่ถูกแตะ", !r2.ok && r2.e.kind === "mp4" && r2.e.detail.length === 3 && sha(img) === hImg && partials().length === 0, r2.e?.title);

// ---------- ที่ว่างไม่พอ ----------
await inv("dev_fake_free", { bytes: 10 * 1024 * 1024 });
const r3 = await invTry("merge_apply", { req: { movie: img, tracks: mi.tracks, covers: { portrait: "keep", land: "keep" }, output: "mkv", original: "keep", checkSource: false, checkOutput: true } });
await inv("dev_fake_free", { bytes: 0 });
check("ที่ว่างไม่พอ ไม่เริ่ม บอกต้องการเท่าไหร่ เหลือเท่าไหร่", !r3.ok && r3.e.kind === "space" && /ต้องการ .* แต่เหลือ 10 MB/.test(r3.e.detail[0]) && sha(img) === hImg, r3.e?.detail?.[0]);

// ---------- ไฟล์ถูกเปิดอยู่ ----------
const holder = spawn("powershell", ["-NoProfile", "-Command", "$f=[IO.File]::Open($env:HOLD_PATH,'Open','Read','Read'); [Console]::Out.WriteLine('held'); [Console]::Out.Flush(); Start-Sleep -Seconds 60; $f.Close()"], { env: { ...process.env, HOLD_PATH: img }, windowsHide: true });
await new Promise((ok) => holder.stdout.once("data", ok));
const r4 = await invTry("merge_apply", { req: { movie: img, tracks: mi.tracks, covers: { portrait: "keep", land: "keep" }, output: "mkv", original: "keep", checkSource: false, checkOutput: true } });
holder.kill();
await sleep(300);
check("ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น ไม่เริ่ม ไฟล์ไม่ถูกแตะ", !r4.ok && r4.e.kind === "inuse" && sha(img) === hImg, r4.e?.title);

// ---------- กดหยุดกลางทาง ----------
await c.evaluate("window.__cancelOn = \"กำลังรวมเข้าไฟล์ใหม่\"");
const r5 = await invTry("merge_apply", { req: { movie: img, tracks: mi.tracks, covers: { portrait: "keep", land: "keep" }, output: "mkv", original: "keep", checkSource: false, checkOutput: true } });
check("กดหยุดกลางทาง หยุดแล้ว ไฟล์ที่ทำค้างถูกลบ ไฟล์เดิมไม่ถูกแตะ", !r5.ok && r5.e.kind === "cancelled" && partials().length === 0 && sha(img) === hImg && existsSync(img), r5.ok ? "รวมเสร็จก่อนกดหยุด" : r5.e.detail.join(" · "));

// ---------- ชื่อซ้ำ ไม่เขียนทับ ----------
copyFileSync(img, join(DIR, "ซับรูป (2024).mp4"));
const keepPgs = mi.tracks.filter((t) => t.kind !== "subtitle");
const r6 = await invTry("merge_apply", { req: { movie: img, tracks: keepPgs, covers: { portrait: "keep", land: "keep" }, output: "mp4", original: "keep", checkSource: false, checkOutput: true } });
check("มีไฟล์ชื่อเดียวกันอยู่แล้ว ไม่เขียนทับ", !r6.ok && r6.e.kind === "exists" && sha(img) === hImg, r6.e?.title);
rmSync(join(DIR, "ซับรูป (2024).mp4"), { force: true });

// ---------- แปลงเสียงตอนรวม (ขั้น 3) · พากย์ไทย AC-3 แทนที่เป็น Opus 256 · เสียงอังกฤษเพิ่มคู่เป็น FLAC ----------
copyFileSync(join(AV, "ดาวตก (2024).mkv"), join(DIR, "แปลงเสียง (2024).mkv"));
const CM = join(DIR, "แปลงเสียง (2024).mkv");
const cm = await inv("merge_inspect", { path: CM });
const cdub = await inv("merge_add_file", { path: join(AV, "ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3"), movieDuration: cm.duration });
const conv = [cm.tracks[0], { ...cdub.tracks[0], name: "พากย์ไทย Opus", convert: { codec: "opus", encoder: "native", p: { bitrate: 256 } } }, { ...cm.tracks[1], convert: { codec: "flac", encoder: "native", p: {} }, pair: true, convName: "English FLAC" }];
await c.evaluate("window.__mergeEvents = []");
const r7 = await invTry("merge_apply", { req: { movie: CM, tracks: conv, covers: { portrait: "keep", land: "keep" }, output: "mkv", original: "keep", checkSource: false, checkOutput: true } });
const ev7 = [...new Set((await c.evaluate("window.__mergeEvents")).map((e) => e.phase))];
const t7 = r7.ok ? ident(r7.r.output).tracks.map((t) => `${t.codec}|${t.properties.track_name ?? ""}`) : [];
check("แปลงเสียงตอนรวม พากย์ไทยเป็น Opus แทนที่ · เสียงอังกฤษเพิ่มคู่เป็น FLAC · บอกขั้นกำลังแปลงเสียง 1 จาก 2 กับ 2 จาก 2", r7.ok && r7.r.verified && t7.join(" · ") === "AVC/H.264/MPEG-4p10| · Opus|พากย์ไทย Opus · AAC|English · FLAC|English FLAC" && ev7.includes("กำลังแปลงเสียง 1 จาก 2 เป็น OPUS") && ev7.includes("กำลังแปลงเสียง 2 จาก 2 เป็น FLAC"), r7.ok ? `${t7.join(" · ")} · ${ev7.join(" → ")}` : JSON.stringify(r7.e));

// ---------- ต้นฉบับใน test-media ไม่ถูกแตะ ----------
const srcAfter = Object.fromEntries(readdirSync(AV).map((f) => [f, sha(join(AV, f))]));
check("ไฟล์ชุดเสียงซับใน test-media hash เท่าเดิมทุกไฟล์", JSON.stringify(srcAfter) === JSON.stringify(srcBefore), `${Object.keys(srcAfter).length} ไฟล์`);
check("ไม่มีไฟล์ชั่วคราว .partial ค้างในโฟลเดอร์ทดสอบ", partials().length === 0);

writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 2) + "\n");
const failed = results.filter((x) => !x.pass);
console.log(`\nผ่าน ${results.length - failed.length} จาก ${results.length}`);
c.close();
process.exit(failed.length ? 1 : 0);
