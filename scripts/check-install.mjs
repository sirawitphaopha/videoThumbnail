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
const toolNames = ["mkvmerge.exe", "mkvextract.exe", "mkvpropedit.exe", "ffmpeg.exe", "ffprobe.exe", "MediaInfo.exe", "LIBCURL.DLL"];
const toolDiff = toolNames.filter((t) => !existsSync(join(DEST, "tools", t)) || fileSha(join(DEST, "tools", t)) !== fileSha(resolve("src-tauri", "tools", t)));
const lic = existsSync(join(DEST, "tools", "licenses")) ? readdirSync(join(DEST, "tools", "licenses")).length : 0;
check("เครื่องมือ 7 ไฟล์ลงครบ ค่า hash ตรงกับที่โหลดมา (vendor/README.md) · มีไฟล์สัญญาอนุญาต", toolDiff.length === 0 && lic > 0, toolDiff.length ? `ไม่ตรง ${toolDiff.join(" ")}` : `ครบ 7 ไฟล์ · สัญญาอนุญาต ${lic} ไฟล์`);
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
  const devCmd = await inv("dev_set_check", { path: "x", status: "ok" }).then(() => "เรียกได้", (e) => String(e));
  check("คำสั่งสำหรับเทส (dev_set_check graph_dev_forget) ไม่มีในตัวติดตั้งจริง", !devCmd.includes("เรียกได้"), devCmd.slice(0, 80));
  await inv("set_settings", { patch: { folders: [MOVIES], viewMode: "grid", coverSize: "m", coverOrient: "tall", rescanOnStart: true } });
  await c.evaluate("location.hash = ''; location.reload()"); await sleep(2500);
  const shelfOk = await waitFor("return document.querySelectorAll('.book[data-movie]').length === 1 && !!document.querySelector('.book .cover.has-img img')?.naturalWidth", 60000);
  check("ตัวที่ติดตั้ง อ่านโฟลเดอร์หนังขึ้นชั้น ปกโหลดได้ภายใต้กติกาความปลอดภัยของตัวจริง", shelfOk, await q("return [...document.querySelectorAll('.book[data-movie]')].map((b) => b.dataset.movie).join(' · ')"));
  await c.shot(`${OUT}/01-ตัวที่ติดตั้ง-ชั้นวาง.png`, null, 0);
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
