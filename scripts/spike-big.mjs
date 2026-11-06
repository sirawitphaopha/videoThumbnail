// ลองจริงข้อที่ยังค้างใน TECH-REVIEW หัวข้อ ต้องลองจริงในขั้นเตรียม (ผลตรวจขั้น 0 สเปกข้อ 11)
// ① เปลี่ยนรูปแนบในไฟล์ MKV ที่ใหญ่เกิน 4 GB ด้วยรูปที่ใหญ่กว่าเดิม · ใช้เวลาเท่าไหร่ ไฟล์ยังเล่นได้ไหม
// ② เปลี่ยนรูปแนบตอนมีโปรแกรมอื่นเปิดไฟล์ค้าง ทั้งแบบห้ามคนอื่นเขียน และแบบยอมให้เขียน
// ③ ความเร็วคำนวณ SHA-256 ของไฟล์ใหญ่บนดิสก์เครื่องนี้
// ทำทั้งหมดในโฟลเดอร์ชั่วคราว D:\dev\tmp\spike-big ไม่แตะไฟล์ทดสอบ · ลบไฟล์ใหญ่ทิ้งตอนจบ
// ใช้: node scripts/spike-big.mjs   (เรียกผ่าน . dev.ps1 ก่อน ให้โฟลเดอร์ชั่วคราวอยู่ไดรฟ์ D)
import { spawnSync, spawn } from "node:child_process";
import { mkdirSync, rmSync, statSync, createReadStream, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const T = join(root, "src-tauri", "tools");
const tool = (n) => join(T, `${n}.exe`);
const W = join(process.env.TEMP ?? "D:\\dev\\tmp", "spike-big");
rmSync(W, { recursive: true, force: true });
mkdirSync(W, { recursive: true });
const run = (n, args, enc = "utf8") => spawnSync(tool(n), args, { encoding: enc, maxBuffer: 1 << 26 });
const ms = (t) => `${Math.round(performance.now() - t).toLocaleString()} มิลลิวินาที`;
const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

// ---------- ① ไฟล์ใหญ่เกิน 4 GB ----------
const base = join(root, "test-media", "สร้าง", "หนัง", "Harbor Lights (2021).mkv");
if (!existsSync(base)) { console.log("ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน"); process.exit(1); }
const big = join(W, "ใหญ่เกิน 4GB.mkv");
const N = 270;
let t = performance.now();
const parts = [base];
for (let i = 1; i < N; i++) parts.push("+", base);
let r = run("mkvmerge", ["-q", "-o", big, ...parts]);
const size = statSync(big).size;
console.log(`สร้างไฟล์ใหญ่ ${(size / 2 ** 30).toFixed(2)} GiB (${size.toLocaleString()} ไบต์) รหัส ${r.status} · ${ms(t)}`);

const png = join(W, "ปกใหญ่.png");
spawnSync(tool("ffmpeg"), ["-hide_banner", "-nostdin", "-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=3000x4500:duration=1", "-frames:v", "1", png]);
const before = JSON.parse(run("mkvmerge", ["-J", big]).stdout).attachments;
console.log(`ปกเดิม ${before.map((a) => `${a.file_name} ${a.content_type} ${a.size.toLocaleString()} ไบต์`).join(" · ")} · ปกใหม่ PNG ${statSync(png).size.toLocaleString()} ไบต์`);

t = performance.now();
r = run("mkvpropedit", [big, "--attachment-name", "cover.png", "--attachment-mime-type", "image/png", "--replace-attachment", "name:cover.jpg:" + png]);
console.log(`เปลี่ยนปกในไฟล์ใหญ่ รหัส ${r.status} · ${ms(t)} · ${r.stdout.trim().split(/\r?\n/).pop()}`);
const after = JSON.parse(run("mkvmerge", ["-J", big]).stdout);
console.log(`ปกหลังเปลี่ยน ${after.attachments.map((a) => `${a.file_name} ${a.content_type} ${a.size.toLocaleString()} ไบต์`).join(" · ")} · ขนาดไฟล์ ${statSync(big).size.toLocaleString()} ไบต์`);
const out = join(W, "ดึงออกมา.png");
run("mkvextract", [big, "attachments", `${after.attachments[0].id}:${out}`]);
console.log(`ดึงปกออกมาตรงทุกไบต์: ${sha(out) === sha(png)}`);
const dur = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", big]).stdout.trim();
console.log(`ความยาว ${(+dur / 60).toFixed(1)} นาที (ต้นทาง 20 วินาที × ${N} = ${(20 * N / 60).toFixed(1)} นาที)`);
for (const [label, ss] of [["ต้นเรื่อง", "0"], ["ท้ายเรื่อง", String(Math.floor(+dur) - 15)]]) {
  r = spawnSync(tool("ffmpeg"), ["-hide_banner", "-nostdin", "-v", "error", "-ss", ss, "-i", big, "-t", "10", "-f", "null", "-"], { encoding: "utf8" });
  console.log(`ถอดภาพเสียง 10 วินาที${label} รหัส ${r.status} ${r.stderr.trim() ? "มีข้อผิดพลาด " + r.stderr.trim().slice(0, 120) : "ไม่มีข้อผิดพลาด"}`);
}

// ---------- ② มีโปรแกรมอื่นเปิดไฟล์ค้าง ----------
// เปิดค้างด้วย PowerShell อีกตัว ส่งที่อยู่ผ่านตัวแปรแวดล้อม ไม่ต้องห่วงชื่อไทยเพี้ยนในคำสั่ง
async function whileOpen(share, label) {
  const ps = spawn("powershell.exe", ["-NoProfile", "-Command",
    `$f=[IO.File]::Open($env:SPIKE_FILE,'Open','Read','${share}'); [Console]::Out.WriteLine('open'); Start-Sleep -Seconds 20; $f.Close()`],
    { env: { ...process.env, SPIKE_FILE: big } });
  await new Promise((ok) => ps.stdout.once("data", ok));
  const r2 = run("mkvpropedit", [big, "--edit", "info", "--set", "title=ลองตอนเปิดค้าง " + share]);
  const msg = (r2.stdout + r2.stderr).trim().split(/\r?\n/).filter(Boolean).pop();
  console.log(`เปิดค้างแบบ${label}: mkvpropedit รหัส ${r2.status} · ${msg}`);
  ps.kill();
  await new Promise((ok) => ps.once("exit", ok));
}
await whileOpen("Read", "ห้ามคนอื่นเขียน (Read)");
await whileOpen("ReadWrite", "ยอมให้คนอื่นเขียน (ReadWrite)");
const title = JSON.parse(run("mkvmerge", ["-J", big]).stdout).container.properties.title;
console.log(`ชื่อเรื่องในไฟล์ตอนนี้: ${title}`);

// ---------- ③ ความเร็ว SHA-256 ----------
t = performance.now();
const h = createHash("sha256");
await new Promise((ok, bad) => createReadStream(big, { highWaterMark: 4 << 20 }).on("data", (b) => h.update(b)).on("end", ok).on("error", bad));
const sec = (performance.now() - t) / 1000;
console.log(`SHA-256 ไฟล์ ${(statSync(big).size / 2 ** 30).toFixed(2)} GiB ใช้ ${sec.toFixed(1)} วินาที = ${(statSync(big).size / 2 ** 20 / sec).toFixed(0)} MB/วินาที (SSD ของเครื่องนี้ · อ่านรอบสองอาจมาจากแคช)`);

rmSync(W, { recursive: true, force: true });
console.log("ลบไฟล์ทดสอบใหญ่ทิ้งแล้ว");
