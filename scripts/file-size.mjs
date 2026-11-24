// ตัวเฝ้าขนาดไฟล์ (แบ่งไฟล์ทั้งโปรเจกต์ BUGS ข้อ 153 ขั้น 13 · docs/PLAN-2026-11-22-แบ่งไฟล์.md)
// พี่กันสั่ง 22 พ.ย. 2569 "ระบบแบ่งไฟลื ต้องรองรับงานในอนาคตได้ และมันจะไม่เพิ่มขึ้นมาอีก ระบบต้องรู้ว่าถ้า code เริ่มโต ต้องแบ่ง"
//
// ใช้:  node scripts/file-size.mjs          ตรวจทั้งโปรเจกต์ บอกไฟล์ที่ใกล้ถึงเวลาแบ่งกับไฟล์ที่ต้องแบ่ง
//       node scripts/file-size.mjs --hook   ตัวกันก่อนรันคำสั่งของ Claude Code (PreToolUse) อ่านคำสั่งจาก stdin ใส่ได้ใน .claude/settings.json ของเครื่อง (.gitignore กันโฟลเดอร์ .claude ไว้ จึงไม่ขึ้น git)
//       node scripts/file-size.mjs --staged  ตัวกันก่อน commit ของ git (.githooks/pre-commit) ไฟล์ที่ stage ไว้นับเนื้อตามที่จะเข้า commit ไฟล์ที่ยังไม่อยู่ใน git ไม่นับ
//                                            เตือนเกิน 450 เฉพาะไฟล์ที่แตะใน commit นั้น
//       npm run check:size                  เหมือนแบบแรก
// ตัวกันก่อน commit ของ git ตั้งอัตโนมัติตอน npm install (สคริปต์ prepare ตั้ง core.hooksPath เป็น .githooks)
//
// นับ โค้ดหน้าจอ src/**/*.ts tsx css (ไม่นับ src/mockups ที่เป็นมอคอัป) · โค้ด Rust src-tauri/src/**/*.rs ไม่นับเทส
//   ไฟล์ Rust ที่มีเทสต่อท้าย (#[cfg(test)] mod tests) นับเฉพาะส่วนก่อนเทส · ไฟล์ tests.rs ไม่นับ
// ไม่นับ ตัวตรวจใน scripts/ มอคอัป เอกสาร (พี่กันเคาะว่าไม่ต้องแบ่ง)
// เกิน 450 บรรทัด เตือนว่าใกล้ถึงเวลาแบ่ง แบ่งตอนแตะไฟล์นั้นครั้งถัดไป · เกิน 600 บรรทัด ตก ต้องแบ่งก่อน commit
// ข้อยกเว้นอยู่ scripts/file-size-allow.json ใส่ไฟล์ เพดานใหม่ และเหตุผล · ไฟล์ในรายการโตเกินเพดานก็ตก (เพดานคือความยาวตอนลงรายการ ห้ามโตต่อ)
// ก้อนยาว (BUGS ข้อ 155) วัดคอมโพเนนต์ ฟังก์ชัน ตารางระดับบนสุดของไฟล์ ts tsx และฟังก์ชัน Rust ทุกระดับ เกิน 200 บรรทัดเตือนให้แยกเป็นส่วนย่อยตอนแตะ
//   เตือนอย่างเดียว ไม่กัน commit (พี่กันเคาะ 24 พ.ย. 2569 "ไม่ต้องบังคับขนาดนั้น เพราะยังไงก็เเก้ไปก่อน เดี๋ยวถึงวันนึงที่แก้ไปเยอะ เราก็จะมาสั่งให้เธอเเบ่งไฟล์อีกรอบ")
//   วัดจากรูปแบบการเขียนของโปรเจกต์ ก้อนระดับบนสุดขึ้นต้นที่คอลัมน์แรก จบที่บรรทัดปิดวงเล็บที่คอลัมน์แรก · ฟังก์ชัน Rust จบที่ } ระดับย่อหน้าเดียวกับบรรทัด fn
//   ไฟล์ที่ไม่ต้องเตือนก้อนยาวใส่ใน "blocks" ของ file-size-allow.json พร้อมเหตุผล (ไฟล์ข้อมูล ไฟล์ที่ยกจากต้นฉบับ)
import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import { join, relative } from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const ROOT = join(fileURLToPath(import.meta.url), "../..");
const WARN = 450, MAX = 600, BLOCK = 200;
const arg = (a) => process.argv.some((x) => x.trim() === a); // ตัดช่องว่างท้าย กันไฟล์ hook ที่ได้ CRLF ส่ง "--staged\r"

if (arg("--hook")) {
  // ตัวกันของ Claude Code ได้ข้อมูลคำสั่งเป็น JSON ทาง stdin · ตรวจเฉพาะคำสั่งที่มี git commit · ตกแล้วออกด้วยรหัส 2 ให้คำสั่ง commit ไม่ถูกรัน
  let input = ""; try { input = readFileSync(0, "utf8"); } catch { /* ไม่มี stdin */ }
  let cmd = ""; try { cmd = JSON.parse(input)?.tool_input?.command ?? ""; } catch { /* ไม่ใช่ JSON */ }
  if (!/\bgit\b[^\n]*\bcommit\b/.test(cmd)) process.exit(0);
}

const allowPath = join(ROOT, "scripts/file-size-allow.json");
const allowAll = existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, "utf8")) : {};
const allow = allowAll.files ?? {};
const blockAllow = allowAll.blocks ?? {};

const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
// ที่อยู่ไฟล์เทียบด้วย / เสมอ (Windows ได้ \ จาก path.join · ผู้ช่วยตรวจทานขั้น 13.5 เจอว่าเดิมนับมอคอัปกับ tests.rs บน Windows จนตกทุก commit)
const relOf = (p) => relative(ROOT, p).split("\\").join("/");
const STAGED = arg("--staged");
const git = (cmd) => execSync(`git -c core.quotepath=off ${cmd}`, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 26 });
// ตอน commit นับเนื้อไฟล์ตามที่ stage ไว้ (สิ่งที่จะเข้า commit จริง) และไม่นับไฟล์ที่ยังไม่อยู่ใน git
let staged = new Set(), tracked = null;
if (STAGED) {
  try { staged = new Set(git("diff --cached --name-only -z --diff-filter=ACMR").split("\0").filter(Boolean)); tracked = new Set(git("ls-files -z").split("\0").filter(Boolean)); } catch { /* ไม่ใช่ที่เก็บ git นับจากไฟล์ในเครื่อง */ }
}
const files = [
  ...walk(join(ROOT, "src")).filter((p) => /\.(tsx?|css)$/.test(p) && !relOf(p).startsWith("src/mockups/")),
  ...walk(join(ROOT, "src-tauri/src")).filter((p) => { const r = relOf(p); return r.endsWith(".rs") && !r.endsWith("/tests.rs") && !/_tests\.rs$/.test(r); }),
].filter((p) => !tracked || tracked.has(relOf(p)) || staged.has(relOf(p)));
/** เนื้อไฟล์ที่นับ · ตอน commit ไฟล์ที่ stage ไว้อ่านจาก index */
const textOf = (p) => { const r = relOf(p); if (STAGED && staged.has(r)) { try { return git(`show ":${r}"`); } catch { /* อ่านจากไฟล์ */ } } return readFileSync(p, "utf8"); };

/** จำนวนบรรทัดที่นับ · Rust ตัดส่วนเทสท้ายไฟล์ */
function count(p) {
  const L = textOf(p).replace(/\r\n/g, "\n").split("\n");
  if (p.endsWith(".rs")) {
    const i = L.findIndex((l, k) => /^#\[cfg\(test\)\]/.test(l) && /^(pub(\(crate\))?\s+)?mod\s+\w+\s*\{/.test(L[k + 1] ?? ""));
    if (i >= 0) return i;
  }
  return L.length - (L[L.length - 1] === "" ? 1 : 0);
}

/** จุดตัดที่แนะนำ เส้นแบ่งหัวข้อที่ใกล้กลางไฟล์ที่สุด (/* ---- หรือ // ---- หรือฟังก์ชันระดับบนสุด) */
function cutHint(p, n) {
  const L = textOf(p).replace(/\r\n/g, "\n").split("\n").slice(0, n);
  const marks = L.map((l, i) => (/^(\/\*|\/\/)\s?-{4,}/.test(l) || /^(export\s+)?(default\s+)?(async\s+)?(function|class)\s/.test(l) || /^(pub(\(crate\))?\s+)?(async\s+)?fn\s/.test(l) ? i : -1)).filter((i) => i > 0);
  if (!marks.length) return "";
  const best = marks.reduce((a, b) => (Math.abs(b - n / 2) < Math.abs(a - n / 2) ? b : a));
  return `จุดตัดที่ใกล้กลางไฟล์ บรรทัด ${best + 1}: ${L[best].trim().slice(0, 60)}`;
}

/** ก้อนที่ยาวเกิน BLOCK บรรทัด คืน [{ name, line, len }] · n คือจำนวนบรรทัดที่นับ (Rust ไม่นับส่วนเทสท้ายไฟล์) */
function longBlocks(p, n) {
  if (p.endsWith(".css")) return [];
  const L = textOf(p).replace(/\r\n/g, "\n").split("\n").slice(0, n);
  const out = [];
  if (p.endsWith(".rs")) {
    const FN = /^( *)(?:pub(?:\([\w:]+\))? )?(?:const )?(?:async )?(?:unsafe )?(?:extern "[^"]+" )?fn (\w+)/;
    for (let i = 0; i < L.length; i++) {
      const m = L[i].match(FN);
      if (!m || /\}\s*$/.test(L[i]) || /;\s*$/.test(L[i])) continue; // ฟังก์ชันบรรทัดเดียว หรือแค่ประกาศ
      const close = m[1] + "}";
      let j = i + 1;
      while (j < L.length && L[j].trimEnd() !== close) j++;
      if (j < L.length && j - i + 1 > BLOCK) out.push({ name: m[2], line: i + 1, len: j - i + 1 });
    }
    return out;
  }
  const DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
  for (let i = 0; i < L.length; i++) {
    const m = L[i].match(DECL);
    if (!m) continue;
    let end = i;
    for (let j = i + 1; j < L.length; j++) {
      const l = L[j];
      if (!l || /^\s/.test(l)) continue; // บรรทัดว่างกับบรรทัดที่ย่อหน้า อยู่ในก้อน
      if (/^[}\])]/.test(l)) {
        if (/[{(]\s*$/.test(l)) continue; // }) { ปิดช่องรับค่าหลายบรรทัดแล้วเปิดตัวฟังก์ชันต่อ ยังไม่จบก้อน
        end = j; break; // ปิดวงเล็บที่คอลัมน์แรก จบก้อน
      }
      break; // คำสั่งระดับบนสุดตัวถัดไป ก้อนนี้จบบรรทัดเดียว
    }
    if (end - i + 1 > BLOCK) out.push({ name: m[1], line: i + 1, len: end - i + 1 });
    i = Math.max(i, end);
  }
  return out;
}

const hint = (p, n) => { const h = cutHint(p, n); return h ? " · " + h : ""; };
const warn = [], fail = [], stale = [], blocks = [];
for (const p of files) {
  const rel = relOf(p), n = count(p), a = allow[rel];
  if (!blockAllow[rel]) for (const b of longBlocks(p, n)) blocks.push(`${rel} ${b.name} บรรทัด ${b.line} ยาว ${b.len} บรรทัด`);
  if (a) {
    if (n > a.max) fail.push(`${rel} ${n} บรรทัด เกินเพดานในรายการยกเว้น ${a.max} (${a.why})${hint(p, n)}`);
    else if (n <= MAX) stale.push(`${rel} เหลือ ${n} บรรทัด ไม่เกิน ${MAX} แล้ว เอาออกจากรายการยกเว้นได้`);
    continue;
  }
  if (n > MAX) fail.push(`${rel} ${n} บรรทัด เกิน ${MAX}${hint(p, n)}`);
  else if (n > WARN) warn.push(`${rel} ${n} บรรทัด`);
}
for (const rel of Object.keys(allow)) if (!files.some((p) => relOf(p) === rel)) stale.push(`${rel} ไม่มีไฟล์นี้แล้ว เอาออกจากรายการยกเว้น`);
for (const rel of Object.keys(blockAllow)) if (!files.some((p) => relOf(p) === rel)) stale.push(`${rel} ไม่มีไฟล์นี้แล้ว เอาออกจากรายการยกเว้นก้อนยาว`);

// ตอน commit เตือนเฉพาะไฟล์ที่แตะ ให้แบ่งตอนแตะไฟล์นั้นตามกติกา ไม่พิมพ์รายการเดิมซ้ำทุก commit
if (STAGED) warn.splice(0, warn.length, ...warn.filter((x) => staged.has(x.split(" ")[0])));
if (STAGED) blocks.splice(0, blocks.length, ...blocks.filter((x) => staged.has(x.split(" ")[0])));
const out = [];
if (blocks.length) out.push(`ก้อนยาว (เกิน ${BLOCK} บรรทัด) ${blocks.length} ก้อน แยกเป็นส่วนย่อยตอนแตะ ตามแบบโครงใน CLAUDE.md หัวข้อแนวทางวางไฟล์ (เตือนอย่างเดียว ไม่กัน commit)`, ...blocks.map((x) => "  " + x));
if (warn.length) out.push(`ใกล้ถึงเวลาแบ่ง (เกิน ${WARN} บรรทัด) ${warn.length} ไฟล์ แบ่งตอนแตะไฟล์นั้นครั้งถัดไป`, ...warn.map((x) => "  " + x));
if (stale.length) out.push("รายการยกเว้นที่ควรเก็บกวาด", ...stale.map((x) => "  " + x));
if (fail.length) out.push(`ต้องแบ่งก่อน commit (เกิน ${MAX} บรรทัด) ${fail.length} ไฟล์ · แนวทางวางไฟล์อยู่ CLAUDE.md หัวข้อแนวทางวางไฟล์`, ...fail.map((x) => "  " + x));
out.push(`ตรวจ ${files.length} ไฟล์ · ตก ${fail.length} · เตือน ${warn.length} · ก้อนยาว ${blocks.length}`);
(fail.length ? console.error : console.log)(out.join("\n"));
process.exit(fail.length ? (arg("--hook") ? 2 : 1) : 0);
