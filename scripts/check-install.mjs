// เทสขั้น 8 ตัวติดตั้ง (แผนขั้น 8) · ลงแล้วเปิดได้ เครื่องมือครบ · ถอนการติดตั้งได้ ไม่ลบไฟล์หนัง
// ไม่มีหน้าต่างเด้งขึ้นจอ (พี่กันลงเวร คนอื่นใช้คอม) · ติดตั้งแบบเงียบ /S ลงโฟลเดอร์ทดสอบบนไดรฟ์ D · เปิดตัวที่ติดตั้งแบบอยู่หลังสุด (MOVIE_SHELF_BACKGROUND)
// ถอนการติดตั้งแบบเงียบตอนจบ ไม่ทิ้งโปรแกรมค้างในเครื่อง
// ใช้: node scripts/check-install.mjs  (หลัง npm run tauri build)
import { mkdirSync, rmSync, readdirSync, existsSync, copyFileSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-07/ขั้น8-ตัวติดตั้ง";
mkdirSync(OUT, { recursive: true });
const NSIS = resolve("src-tauri", "target", "release", "bundle", "nsis");
const installer = readdirSync(NSIS).filter((f) => f.endsWith("-setup.exe")).map((f) => join(NSIS, f))[0];
const TMP = "D:\\dev\\tmp";
for (const d of readdirSync(TMP)) if (d.startsWith("ชั้นหนังติดตั้งเทส") || d.startsWith("ชั้นหนังโฟลเดอร์เทส")) rmSync(join(TMP, d), { recursive: true, force: true });
const DEST = join(TMP, `ชั้นหนังติดตั้งเทส-${Date.now()}`);
const MOVIES = join(TMP, `ชั้นหนังโฟลเดอร์เทส-${Date.now()}`);
mkdirSync(MOVIES, { recursive: true });
copyFileSync(resolve("test-media", "สร้าง", "หนัง", "Harbor Lights (2021).mkv"), join(MOVIES, "Harbor Lights (2021).mkv"));
const movieSha = () => createHash("sha256").update(readFileSync(join(MOVIES, "Harbor Lights (2021).mkv"))).digest("hex");
const sha0 = movieSha();

const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail: String(detail) }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const fileSha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
// ตัวติดตั้งกับตัวโปรแกรมที่มันเปิดเอง (ถ้ามี) ได้ตัวแปรนี้ไปด้วย หน้าต่างอยู่หลังสุด ไม่เด้ง
const env = { ...process.env, MOVIE_SHELF_BACKGROUND: "1",
  WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9222 --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding" };

/* ---------- 1 ติดตั้งแบบเงียบ ---------- */
const size = statSync(installer).size;
const t0 = Date.now();
const ins = spawnSync(installer, ["/S", `/D=${DEST}`], { env, windowsVerbatimArguments: true, timeout: 600000 });
const secs = ((Date.now() - t0) / 1000).toFixed(0);
const exe = existsSync(DEST) ? readdirSync(DEST).find((f) => f.toLowerCase().endsWith(".exe") && !f.toLowerCase().startsWith("uninstall")) : null;
check("ติดตั้งแบบเงียบลงโฟลเดอร์ที่เลือกได้ ไม่มีหน้าต่าง", ins.status === 0 && exe, `ตัวติดตั้ง ${installer.split("\\").pop()} ${(size / 1048576).toFixed(0)} MB · ใช้ ${secs} วินาที · ได้ ${exe ?? "ไม่มีไฟล์โปรแกรม"} · รหัส ${ins.status}`);
// เครื่องมือแผนเดิม 7 ไฟล์ กับตัวแปลงเสียงของแผนเสียงและซับ 7 ไฟล์ (flac กับ DLL ประกอบ lame กับ DLL ประกอบ opusenc wavpack MACDll64)
const toolNames = ["mkvmerge.exe", "mkvextract.exe", "mkvpropedit.exe", "ffmpeg.exe", "ffprobe.exe", "MediaInfo.exe", "LIBCURL.DLL",
  "flac.exe", "libFLAC.dll", "lame.exe", "libmpg123-0.dll", "opusenc.exe", "wavpack.exe", "MACDll64.dll"];
const toolDiff = toolNames.filter((t) => !existsSync(join(DEST, "tools", t)) || fileSha(join(DEST, "tools", t)) !== fileSha(resolve("src-tauri", "tools", t)));
const lic = existsSync(join(DEST, "tools", "licenses")) ? readdirSync(join(DEST, "tools", "licenses")).length : 0;
check(`เครื่องมือ ${toolNames.length} ไฟล์ลงครบ (รวมตัวแปลงเสียง) ค่า hash ตรงกับที่โหลดมา (vendor/README.md) · มีไฟล์สัญญาอนุญาต`, toolDiff.length === 0 && lic > 0, toolDiff.length ? `ไม่ตรง ${toolDiff.join(" ")}` : `ครบ ${toolNames.length} ไฟล์ · สัญญาอนุญาต ${lic} ไฟล์`);
const uninst = existsSync(DEST) ? readdirSync(DEST).find((f) => f.toLowerCase().startsWith("uninstall")) : null;
check("มีตัวถอนการติดตั้งในโฟลเดอร์ที่ลง", !!uninst, uninst ?? "ไม่มี");

/* ---------- 2 เปิดตัวที่ติดตั้งแบบอยู่หลังสุด ---------- */
// ปิดตัวที่เปิดค้างก่อน (ตัวติดตั้งอาจเปิดให้เอง) แล้วเปิดใหม่ด้วยตัวแปรอยู่หลังสุด
spawnSync("taskkill", ["/F", "/IM", exe ?? "movie-shelf.exe"], { stdio: "ignore" });
await sleep(800);
const app = spawn(join(DEST, exe), [], { env, detached: true, stdio: "ignore" });
app.unref();
let c = null;
for (let i = 0; i < 60 && !c; i++) { try { c = await connect(); } catch { await sleep(1000); } }
check("เปิดตัวที่ติดตั้งได้ ต่อพอร์ตดีบักได้ (หน้าต่างอยู่หลังสุด ไม่ขึ้นจอ)", !!c);
if (c) {
  const q = (js) => c.evaluate(`(() => { ${js} })()`);
  const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
  const waitFor = async (js, ms = 30000) => { for (let t = 0; t < ms; t += 200) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(200); } return false; };
  await waitFor("return !!window.__TAURI_INTERNALS__", 30000);
  const origin = await q("return location.origin");
  check("หน้าจอโหลดจากในตัวโปรแกรม ไม่ใช่เซิร์ฟเวอร์ทดสอบ", origin === "http://tauri.localhost", origin);
  const tools = await inv("check_tools");
  check("ตัวที่ติดตั้งเรียกเครื่องมือทั้ง 6 ตัวได้ พร้อมเลขรุ่น", tools.length === 6 && tools.every((t) => t.ok), tools.map((t) => `${t.name} ${t.ok ? "พร้อม" : "ไม่พร้อม"}`).join(" · "));
  // ตัวแปลงเสียง (แผนเสียงและซับ ขั้น 9) · ตัวที่แนบมาเรียกได้ทุกตัว Monkey's Audio ถามรุ่นจาก DLL ได้ · คำสั่งหน้าแปลงเสียงมีในตัวจริง
  const encs = await inv("encoders_status");
  const encOk = ["flac", "opusenc", "lame", "wavpack", "MACDll64", "ffmpeg"].every((n) => encs.find((e) => e.name === n)?.ok);
  check("ตัวที่ติดตั้งเรียกตัวแปลงเสียงที่แนบมาได้ครบ flac opusenc lame wavpack Monkey's Audio ffmpeg พร้อมเลขรุ่น", encOk && encs.find((e) => e.name === "MACDll64")?.version, encs.map((e) => `${e.name} ${e.ok ? e.version : "ไม่มี"}`).join(" · "));
  const probe = await inv("convert_probe", { path: resolve("test-media", "สร้าง", "เสียงซับ", "เพลงทดสอบ 96k.flac") }).then((f) => `${f.codec} ${f.tags.length} ช่อง ปก ${!!f.cover}`, (e) => "ผิด " + String(e));
  check("ตัวที่ติดตั้งอ่านไฟล์เสียงเข้าคิวแปลงได้ (ข้อมูลเพลงกับปก)", probe.startsWith("flac 5 ช่อง ปก true"), probe);
  const fakeFree = await inv("dev_fake_free", { bytes: 0 }).then(() => "เรียกได้", (e) => String(e));
  check("คำสั่งหลอกที่ว่างสำหรับเทส (dev_fake_free) ไม่มีในตัวติดตั้งจริง", !fakeFree.includes("เรียกได้"), fakeFree.slice(0, 80));
  const devCmd = await inv("dev_set_check", { path: "x", status: "ok" }).then(() => "เรียกได้", (e) => String(e));
  check("คำสั่งสำหรับเทส (dev_set_check graph_dev_forget) ไม่มีในตัวติดตั้งจริง", !devCmd.includes("เรียกได้"), devCmd.slice(0, 80));
  await inv("set_settings", { patch: { folders: [MOVIES], viewMode: "grid", coverSize: "m", coverOrient: "tall", rescanOnStart: true } });
  await c.evaluate("location.hash = ''; location.reload()"); await sleep(2500);
  const shelfOk = await waitFor("return document.querySelectorAll('.book[data-movie]').length === 1 && !!document.querySelector('.book .cover.has-img img')?.naturalWidth", 60000);
  check("ตัวที่ติดตั้ง อ่านโฟลเดอร์หนังขึ้นชั้น ปกโหลดได้ภายใต้กติกาความปลอดภัยของตัวจริง", shelfOk, await q("return [...document.querySelectorAll('.book[data-movie]')].map((b) => b.dataset.movie).join(' · ')"));
  await c.shot(`${OUT}/01-ตัวที่ติดตั้ง-ชั้นวาง.png`, null, 0);

  // ปิดโปรแกรมระหว่างครอบไฟล์ใหญ่ (ผู้ช่วยตรวจโค้ดข้อ 2) · เดิมปิดทันที ไฟล์ .partial ค้าง · ตอนนี้ต้องรองานลบไฟล์ที่ทำค้างก่อนปิด
  // ไฟล์ใหญ่ราว 1.6 GB ต่อจากคลิปเดิมแบบไม่แปลงใหม่ (แบบตัวเทสขั้น 4) · สั่งปิดผ่านคำสั่งเดียวกับปุ่ม หยุดงานแล้วปิดโปรแกรม
  const big = join(MOVIES, "หนังยาว (2020).mp4");
  const list = join(TMP, "__list-install.txt");
  writeFileSync(list, Array.from({ length: 100 }, () => `file '${resolve("test-media", "สร้าง", "หนัง", "The Last Orchard (2022).mp4").replace(/\\/g, "/")}'`).join("\n"));
  spawnSync(resolve("src-tauri", "tools", "ffmpeg.exe"), ["-v", "error", "-nostdin", "-n", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", big]);
  rmSync(list, { force: true });
  const bigSha = fileSha(big);
  const partials = () => readdirSync(MOVIES).filter((f) => f.endsWith(".partial"));
  const info = await inv("poster_open", { path: resolve("test-media", "สร้าง", "รูป", "poster.jpg") });
  await inv("poster_render", { req: { geo: { rotate: 0, flip: false, mode: "crop", x: info.crop[0], y: info.crop[1], w: info.crop[2], h: info.crop[3], pad: "#ffffff" }, format: "jpg", quality: 90, choose: true, sizes: false } });
  c.evaluate(`window.__TAURI_INTERNALS__.invoke('poster_apply', { req: { path: ${JSON.stringify(big)}, output: 'mkv', checkSource: false, checkOutput: true, original: 'keep', drop: [] } }).catch(() => {})`).catch(() => {});
  let sawPartial = false;
  for (let i = 0; i < 100 && !sawPartial; i++) { await sleep(100); sawPartial = partials().length > 0; }
  await sleep(300);
  const tClose = Date.now();
  await c.evaluate("window.__TAURI_INTERNALS__.invoke('force_close')").catch(() => {});
  const running = () => spawnSync("tasklist", ["/FI", `IMAGENAME eq ${exe}`, "/NH"], { encoding: "utf8" }).stdout.toLowerCase().includes(exe.toLowerCase());
  let closed = false;
  for (let i = 0; i < 60 && !closed; i++) { await sleep(500); closed = !running(); }
  const closeSecs = ((Date.now() - tClose) / 1000).toFixed(1);
  check("กด หยุดงานแล้วปิดโปรแกรม ระหว่างครอบไฟล์ 1.6 GB · โปรแกรมรองานหยุดแล้วปิดเอง ไฟล์ที่ทำค้างถูกลบ ไม่มีไฟล์ใหม่ ไฟล์เดิม hash เท่าเดิม",
    sawPartial && closed && partials().length === 0 && !existsSync(join(MOVIES, "หนังยาว (2020).mkv")) && fileSha(big) === bigSha,
    `เห็น .partial ก่อนปิด ${sawPartial} · ปิดเองใน ${closeSecs} วินาที ${closed} · .partial ที่เหลือ ${partials().length}`);
  await c.close?.();
}
spawnSync("taskkill", ["/F", "/IM", exe ?? "movie-shelf.exe"], { stdio: "ignore" });
await sleep(1500);

/* ---------- 3 ถอนการติดตั้งแบบเงียบ ไม่ลบไฟล์หนัง ---------- */
if (uninst) {
  spawnSync(join(DEST, uninst), ["/S"], { env, windowsVerbatimArguments: true, timeout: 300000 });
  // ตัวถอนของ NSIS คัดลอกตัวเองไปรันแยก รอจนไฟล์โปรแกรมหาย
  for (let i = 0; i < 120 && existsSync(join(DEST, exe ?? "x")); i++) await sleep(500);
  const left = existsSync(DEST) ? readdirSync(DEST) : [];
  check("ถอนการติดตั้งแบบเงียบ ไฟล์โปรแกรมกับเครื่องมือหายหมด", !existsSync(join(DEST, exe ?? "x")) && !existsSync(join(DEST, "tools", "ffmpeg.exe")), left.length ? `เหลือ ${left.join(" ")}` : "โฟลเดอร์ว่างหรือถูกลบ");
  check("ถอนการติดตั้งแล้ว ไฟล์หนังในโฟลเดอร์ชั้นวางยังอยู่ ค่า hash เท่าเดิม", existsSync(join(MOVIES, "Harbor Lights (2021).mkv")) && movieSha() === sha0, sha0.slice(0, 16));
}

const pass = results.filter((r) => r.pass).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 1));
process.exit(pass === results.length ? 0 : 1);
