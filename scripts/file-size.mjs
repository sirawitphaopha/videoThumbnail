// ตัวเฝ้าขนาดไฟล์ (แบ่งไฟล์ทั้งโปรเจกต์ BUGS ข้อ 153 ขั้น 13 · docs/PLAN-2026-11-22-แบ่งไฟล์.md)
// พี่กันสั่ง 22 พ.ย. 2569 "ระบบแบ่งไฟลื ต้องรองรับงานในอนาคตได้ และมันจะไม่เพิ่มขึ้นมาอีก ระบบต้องรู้ว่าถ้า code เริ่มโต ต้องแบ่ง"
//
// ใช้:  node scripts/file-size.mjs          ตรวจทั้งโปรเจกต์ บอกไฟล์ที่ใกล้ถึงเวลาแบ่งกับไฟล์ที่ต้องแบ่ง
//       node scripts/file-size.mjs --hook   ตัวกันก่อนรันคำสั่งของ Claude Code (PreToolUse) อ่านคำสั่งจาก stdin ใส่ได้ใน .claude/settings.json ของเครื่อง (.gitignore กันโฟลเดอร์ .claude ไว้ จึงไม่ขึ้น git)
//       node scripts/file-size.mjs --staged  ตัวกันก่อน commit ของ git (.githooks/pre-commit) ตกเหมือนแบบแรก แต่เตือนเฉพาะไฟล์ที่แตะใน commit นั้น
//       npm run check:size                  เหมือนแบบแรก
// ตัวกันก่อน commit ของ git ตั้งอัตโนมัติตอน npm install (สคริปต์ prepare ตั้ง core.hooksPath เป็น .githooks)
//
// นับ โค้ดหน้าจอ src/**/*.ts tsx css (ไม่นับ src/mockups ที่เป็นมอคอัป) · โค้ด Rust src-tauri/src/**/*.rs ไม่นับเทส
//   ไฟล์ Rust ที่มีเทสต่อท้าย (#[cfg(test)] mod tests) นับเฉพาะส่วนก่อนเทส · ไฟล์ tests.rs ไม่นับ
// ไม่นับ ตัวตรวจใน scripts/ มอคอัป เอกสาร (พี่กันเคาะว่าไม่ต้องแบ่ง)
// เกิน 450 บรรทัด เตือนว่าใกล้ถึงเวลาแบ่ง แบ่งตอนแตะไฟล์นั้นครั้งถัดไป · เกิน 600 บรรทัด ตก ต้องแบ่งก่อน commit
// ข้อยกเว้นอยู่ scripts/file-size-allow.json ใส่ไฟล์ เพดานใหม่ และเหตุผล · ไฟล์ในรายการโตเกินเพดานก็ตก (เพดานคือความยาวตอนลงรายการ ห้ามโตต่อ)
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, relative } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const WARN = 450, MAX = 600;

if (process.argv.includes("--hook")) {
  // ตัวกันของ Claude Code ได้ข้อมูลคำสั่งเป็น JSON ทาง stdin · ตรวจเฉพาะคำสั่งที่มี git commit · ตกแล้วออกด้วยรหัส 2 ให้คำสั่ง commit ไม่ถูกรัน
  let input = ""; try { input = readFileSync(0, "utf8"); } catch { /* ไม่มี stdin */ }
  let cmd = ""; try { cmd = JSON.parse(input)?.tool_input?.command ?? ""; } catch { /* ไม่ใช่ JSON */ }
  if (!/\bgit\b[^\n]*\bcommit\b/.test(cmd)) process.exit(0);
}

const allowPath = join(ROOT, "scripts/file-size-allow.json");
const allow = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, "utf8")).files ?? {} : {};

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const files = [
  ...walk(join(ROOT, "src")).filter((p) => /\.(tsx?|css)$/.test(p) && !relative(ROOT, p).startsWith("src/mockups/")),
  ...walk(join(ROOT, "src-tauri/src")).filter((p) => p.endsWith(".rs") && !p.endsWith("/tests.rs") && !/_tests\.rs$/.test(p)),
];

/** จำนวนบรรทัดที่นับ · Rust ตัดส่วนเทสท้ายไฟล์ */
function count(p) {
  const L = readFileSync(p, "utf8").split("\n");
  if (p.endsWith(".rs")) {
    const i = L.findIndex((l, k) => /^#\[cfg\(test\)\]/.test(l) && /^(pub(\(crate\))?\s+)?mod\s+\w+\s*\{/.test(L[k + 1] ?? ""));
    if (i >= 0) return i;
  }
  return L.length - (L[L.length - 1] === "" ? 1 : 0);
}

/** จุดตัดที่แนะนำ เส้นแบ่งหัวข้อที่ใกล้กลางไฟล์ที่สุด (/* ---- หรือ // ---- หรือฟังก์ชันระดับบนสุด) */
function cutHint(p, n) {
  const L = readFileSync(p, "utf8").split("\n").slice(0, n);
  const marks = L.map((l, i) => (/^(\/\*|\/\/)\s?-{4,}/.test(l) || /^(export\s+)?(default\s+)?(async\s+)?(function|class)\s/.test(l) || /^(pub(\(crate\))?\s+)?(async\s+)?fn\s/.test(l) ? i : -1)).filter((i) => i > 0);
  if (!marks.length) return "";
  const best = marks.reduce((a, b) => (Math.abs(b - n / 2) < Math.abs(a - n / 2) ? b : a));
  return `จุดตัดที่ใกล้กลางไฟล์ บรรทัด ${best + 1}: ${L[best].trim().slice(0, 60)}`;
}

const hint = (p, n) => { const h = cutHint(p, n); return h ? " · " + h : ""; };
const warn = [], fail = [], stale = [];
for (const p of files) {
  const rel = relative(ROOT, p).split("\\").join("/"), n = count(p), a = allow[rel];
  if (a) {
    if (n > a.max) fail.push(`${rel} ${n} บรรทัด เกินเพดานในรายการยกเว้น ${a.max} (${a.why})${hint(p, n)}`);
    else if (n <= MAX) stale.push(`${rel} เหลือ ${n} บรรทัด ไม่เกิน ${MAX} แล้ว เอาออกจากรายการยกเว้นได้`);
    continue;
  }
  if (n > MAX) fail.push(`${rel} ${n} บรรทัด เกิน ${MAX}${hint(p, n)}`);
  else if (n > WARN) warn.push(`${rel} ${n} บรรทัด`);
}
for (const rel of Object.keys(allow)) if (!files.some((p) => relative(ROOT, p).split("\\").join("/") === rel)) stale.push(`${rel} ไม่มีไฟล์นี้แล้ว เอาออกจากรายการยกเว้น`);

// ตอน commit เตือนเฉพาะไฟล์ที่แตะ ให้แบ่งตอนแตะไฟล์นั้นตามกติกา ไม่พิมพ์รายการเดิมซ้ำทุก commit
if (process.argv.includes("--staged")) {
  let staged = new Set(); try { staged = new Set(execSync("git diff --cached --name-only", { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean)); } catch { /* ไม่ใช่ที่เก็บ git */ }
  warn.splice(0, warn.length, ...warn.filter((x) => staged.has(x.split(" ")[0])));
}
const out = [];
if (warn.length) out.push(`ใกล้ถึงเวลาแบ่ง (เกิน ${WARN} บรรทัด) ${warn.length} ไฟล์ แบ่งตอนแตะไฟล์นั้นครั้งถัดไป`, ...warn.map((x) => "  " + x));
if (stale.length) out.push("รายการยกเว้นที่ควรเก็บกวาด", ...stale.map((x) => "  " + x));
if (fail.length) out.push(`ต้องแบ่งก่อน commit (เกิน ${MAX} บรรทัด) ${fail.length} ไฟล์ · แนวทางวางไฟล์อยู่ CLAUDE.md หัวข้อแนวทางวางไฟล์`, ...fail.map((x) => "  " + x));
out.push(`ตรวจ ${files.length} ไฟล์ · ตก ${fail.length} · เตือน ${warn.length}`);
(fail.length ? console.error : console.log)(out.join("\n"));
process.exit(fail.length ? (process.argv.includes("--hook") ? 2 : 1) : 0);
