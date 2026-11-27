// ตัวนับบรรทัดโค้ดทุก commit (BUGS ข้อ 160 · docs/PLAN-2026-11-27-นับบรรทัด.md)
// ใช้:  node scripts/line-stats.mjs          นับแล้วเขียน src/generated/lineStats.json ที่หน้าตั้งค่าหัวข้อบรรทัดโค้ดอ่าน
//       npm run stats:lines                 เหมือนกัน · npm run dev กับ npm run build เรียกเองทุกครั้ง
// ไล่ทุก commit ตามสายหลัก (first-parent) ตั้งแต่ commit แรก นับไฟล์ ณ commit นั้นจาก git ตรง ๆ ไม่ย้อนโค้ดในเครื่อง
// ไฟล์ที่เนื้อไม่เปลี่ยน (รหัสเนื้อไฟล์ของ git เท่าเดิม) ใช้ผลเดิม เก็บไว้ใน node_modules/.cache/line-stats.json รอบหน้าเร็วขึ้น
// เลขรุ่นอ่านจาก package.json ของแต่ละ commit · แถว now นับไฟล์ในเครื่องตอนนี้ (รวมที่แก้ค้างและไฟล์ใหม่ที่ยังไม่ add)
// git ไม่มีหรือพัง ไม่ทำให้ dev หรือ build ล้ม เขียนไฟล์ว่างที่บอกเหตุผลแทน แล้วออกด้วยรหัส 0 (ยกเว้นส่ง --strict)
import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { GROUPS, countFile, groupOf } from "./lib/line-count.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/generated/lineStats.json");
const CACHE = join(ROOT, "node_modules/.cache/line-stats.json");
const RULES = 1; // เปลี่ยนกติกาการนับแล้วขยับเลขนี้ ผลที่เก็บไว้ทิ้งทั้งหมด
const STRICT = process.argv.includes("--strict");
const git = (...a) => execFileSync("git", ["-c", "core.quotepath=off", ...a], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });

function write(data) {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data));
}

/** อ่านเนื้อไฟล์หลายไฟล์จาก git ทีเดียว (cat-file --batch) คืน Map รหัส → เนื้อ */
function readBlobs(hashes) {
  const res = new Map();
  if (!hashes.length) return res;
  const r = spawnSync("git", ["cat-file", "--batch"], { cwd: ROOT, input: hashes.join("\n") + "\n", maxBuffer: 1 << 30 });
  const buf = r.stdout; let pos = 0;
  while (pos < buf.length) {
    const nl = buf.indexOf(10, pos); const head = buf.subarray(pos, nl).toString();
    const [h, , size] = head.split(" "); const n = Number(size);
    if (!Number.isFinite(n)) { pos = nl + 1; continue; } // missing
    res.set(h, buf.subarray(nl + 1, nl + 1 + n).toString("utf8"));
    pos = nl + 1 + n + 1;
  }
  return res;
}

const sumInto = (acc, part) => { for (const [g, v] of Object.entries(part)) { const a = (acc[g] ??= [0, 0, 0, 0]); a[0] += v[0]; a[1] += v[1]; a[2] += v[2]; } };

function main() {
  try { git("rev-parse", "--is-inside-work-tree"); } catch { write({ ok: false, why: "ไม่มี git ในเครื่องนี้ หรือโฟลเดอร์นี้ไม่ใช่ที่เก็บ git", groups: GROUPS, points: [] }); return; }
  const shallow = git("rev-parse", "--is-shallow-repository").trim() === "true";
  let cache = {}, done = {};
  try { const c = JSON.parse(readFileSync(CACHE, "utf8")); if (c.rules === RULES) { cache = c.blobs ?? {}; done = c.commits ?? {}; } } catch { /* ยังไม่มี */ }
  const t0 = Date.now();
  const log = git("log", "--first-parent", "--reverse", "--format=%H%x09%cI%x09%s", "HEAD").trim().split("\n").filter(Boolean);
  const points = []; let lastVer = null;
  for (const row of log) {
    const [h, date, ...rest] = row.split("\t"); const subj = rest.join("\t");
    // commit เก่าไม่มีวันเปลี่ยน ผลที่นับไว้แล้วใช้ต่อได้เลย
    if (done[h]) { const { v, n } = done[h]; points.push({ h: h.slice(0, 7), d: date.slice(0, 16), s: subj.slice(0, 90), v, vm: v != null && v !== lastVer && points.length > 0 ? 1 : 0, n }); if (v != null) lastVer = v; continue; }
    const tree = git("ls-tree", "-r", "-z", h).split("\0").filter(Boolean);
    const files = []; let pkg = null;
    for (const ent of tree) {
      const tab = ent.indexOf("\t"); const [, type, hash] = ent.slice(0, tab).split(" "); const p = ent.slice(tab + 1);
      if (type !== "blob") continue;
      if (p === "package.json") pkg = hash;
      const g = groupOf(p); if (g) files.push({ p, hash, g });
    }
    const key = (f) => `${f.hash}|${f.p.endsWith(".rs") ? f.g : f.p.replace(/.*\./, "") + ":" + f.g}`;
    const need = [...new Set(files.filter((f) => !cache[key(f)]).map((f) => f.hash))];
    if (pkg) need.push(pkg);
    const blobs = readBlobs(need);
    const n = {};
    for (const f of files) {
      const k = key(f);
      if (!cache[k]) cache[k] = countFile(f.p, blobs.get(f.hash) ?? "");
      sumInto(n, cache[k]); n[f.g][3]++;
    }
    let v = null; try { v = JSON.parse(blobs.get(pkg) ?? "{}").version ?? null; } catch { /* package.json พังใน commit นั้น */ }
    points.push({ h: h.slice(0, 7), d: date.slice(0, 16), s: subj.slice(0, 90), v, vm: v != null && v !== lastVer && points.length > 0 ? 1 : 0, n });
    if (v != null) lastVer = v;
    done[h] = { v, n };
  }
  // งานในเครื่องตอนนี้ ไฟล์ที่ git เก็บกับไฟล์ใหม่ที่ไม่ได้อยู่ใน .gitignore อ่านจากดิสก์
  const nowN = {};
  for (const p of git("ls-files", "-z", "-co", "--exclude-standard").split("\0").filter(Boolean)) {
    const g = groupOf(p); if (!g || !existsSync(join(ROOT, p))) continue;
    let t; try { t = readFileSync(join(ROOT, p), "utf8"); } catch { continue; }
    sumInto(nowN, countFile(p, t)); nowN[g][3]++;
  }
  let nowV = null; try { nowV = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version; } catch { /* */ }
  try { mkdirSync(dirname(CACHE), { recursive: true }); writeFileSync(CACHE, JSON.stringify({ rules: RULES, blobs: cache, commits: done })); } catch { /* เก็บผลไม่ได้ รอบหน้าช้าลงเท่านั้น */ }
  write({ ok: true, generated: new Date().toISOString(), shallow, groups: GROUPS, points, now: { d: new Date().toISOString().slice(0, 16), v: nowV, n: nowN } });
  console.log(`นับบรรทัด ${points.length} commit ใช้เวลา ${((Date.now() - t0) / 1000).toFixed(1)} วินาที ลง ${OUT.slice(ROOT.length + 1)}`);
}

try { main(); }
catch (e) {
  console.error("นับบรรทัดไม่สำเร็จ", e?.message ?? e);
  try { write({ ok: false, why: String(e?.message ?? e).slice(0, 300), groups: GROUPS, points: [] }); } catch { /* */ }
  if (STRICT) process.exit(1);
}
