// ตัวตรวจตัวนับบรรทัดโค้ด (BUGS ข้อ 160 · docs/PLAN-2026-11-27-นับบรรทัด.md)
// ใช้:  node scripts/check-line-stats.mjs          ตรวจกติกาการนับกับผลของตัวนับ
//       node scripts/check-line-stats.mjs --ui     ตรวจแท็บบรรทัดโค้ดในหน้าตั้งค่าผ่านระบบจำลองหน้าโปรแกรมบนเว็บด้วย (ต้องมี Playwright)
// ไม่ต้องเปิดโปรแกรม ใช้ได้ทั้งคอม Windows และเครื่องคลาวด์
// พิสูจน์ว่าแดง ส่ง LINECOUNT_LIB=<ไฟล์กติกาที่แก้ให้ผิด> ตัวตรวจจะใช้ไฟล์นั้นแทน
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = process.env.LINECOUNT_LIB ? pathToFileURL(resolve(process.env.LINECOUNT_LIB)).href : "./lib/line-count.mjs";
const { kinds, countFile, groupOf, GROUPS } = await import(LIB);

let pass = 0; const fails = [];
export const check = (name, ok, info = "") => { if (ok) pass++; else fails.push(`${name}${info ? `  (${info})` : ""}`); console.log(`${ok ? "ผ่าน" : "ตก  "} ${name}${!ok && info ? `  ${info}` : ""}`); };
const K = (text, lang) => kinds(text, lang).join("");

// ---------------------------------------------------------------- กติกาการนับ (0 โค้ด 1 คอมเมนต์ 2 ว่าง)
check("js คอมเมนต์บรรทัด บล็อก บรรทัดว่าง โค้ดที่มีคอมเมนต์ต่อท้ายนับเป็นโค้ด", K("const a = 1;\n// c\n\n/* a\n b */\nconst h = 2; // tail\n", "js") === "012110", K("const a = 1;\n// c\n\n/* a\n b */\nconst h = 2; // tail\n", "js"));
check("js สตริงที่มี /* ไม่ทำให้บรรทัดถัดไปเป็นคอมเมนต์", K('const g = "src/**/*.ts";\nconst x = 1;\n', "js") === "00" && K('const g = "src/*";\nconst x = 1;\n', "js") === "00" && K("const g = 'a/*';\nx;\n", "js") === "00"); // ตัวอย่างหลังสองตัวมีแต่ตัวเปิด (ตัวแรกบังเอิญมีตัวปิดในสตริงเดียวกัน ตัวนับที่ไม่รู้จักสตริงก็รอด เจอตอนพิสูจน์แดง)
check("js ที่อยู่เว็บ https:// ในสตริงไม่ใช่คอมเมนต์", K('const u = "https://a.b";\n', "js") === "0");
check("jsx คอมเมนต์ในวงเล็บปีกกาบรรทัดเดียวและหลายบรรทัด", K("{/* note */}\n  {/*\n  x\n  */}\n<div />\n", "js") === "11110", K("{/* note */}\n  {/*\n  x\n  */}\n<div />\n", "js"));
check("jsx ข้อความที่มีเครื่องหมาย ' ไม่ค้างเป็นสตริงข้ามบรรทัด", K("<p>Don't</p>\n// c\n", "js") === "01");
check("js template หลายบรรทัด บรรทัดว่างกับ // ข้างในนับเป็นโค้ด", K("const t = `a\n\n// no\n`;\nx;\n", "js") === "00000", K("const t = `a\n\n// no\n`;\nx;\n", "js"));
check("js regex ที่มี / * กับเครื่องหมายคำพูด ไม่ทำให้นับผิด", K('const r = /\\/\\*/;\nconst q = /a"b/;\n// c\n', "js") === "001");
check("js ตัวหาร a / b / c ไม่ถือเป็น regex", K("const z = a / b / c;\n// c\n", "js") === "01");
check("rust /// กับ //! เป็นคอมเมนต์", K("/// doc\n//! mod\nfn a() {}\n", "rust") === "110");
check("rust สตริงดิบ r#\"…\"# ที่มี /* ไม่เปิดคอมเมนต์", K('let s = r#"/* not"#;\nlet y = 1;\n', "rust") === "00");
check("rust ตัวอักษร '\"' กับอายุตัวแปร 'a ไม่ทำให้นับผิด", K("let c = '\"';\nlet l: &'a str = \"x\";\n// c\n", "rust") === "001");
check("rust สตริงข้ามบรรทัด บรรทัดว่างข้างในนับเป็นโค้ด", K('let s = "a\n\nb";\n// c\n', "rust") === "0001");
check("css คอมเมนต์ทั้งบรรทัด กฎที่มีคอมเมนต์ต่อท้ายนับเป็นโค้ด", K("/* a */\n.a { color: red; } /* t */\n\n", "css") === "102");
check("md ข้อความ บรรทัดว่าง คอมเมนต์ <!-- -->", K("# Title\n\ntext\n<!-- c -->\n<!--\nlong\n-->\n", "md") === "0201111");
check("html คอมเมนต์ <!-- --> กับคอมเมนต์ js ในบล็อก script ข้อความที่มี ' ไม่ทำให้นับผิด", K("<!-- c -->\n<script>\n// js c\nlet a=1;\n</script>\n<p>it's</p>\n<!-- d -->\n", "html") === "1010001", K("<!-- c -->\n<script>\n// js c\nlet a=1;\n</script>\n<p>it's</p>\n<!-- d -->\n", "html"));
check("sh บรรทัด #! แรกเป็นโค้ด # เป็นคอมเมนต์", K("#!/bin/sh\n# c\necho x\n", "hash") === "010");
check("ps1 บล็อก <# #> กับ # ต่อท้ายโค้ด", K("<#\nblock\n#>\nWrite-Host x # t\n", "ps1") === "1110");
check("บรรทัดจบแบบ CRLF กับบรรทัดที่มีแต่เว้นวรรค", K("a\r\n   \r\nb\r\n", "js") === "020");
check("ขึ้นบรรทัดใหม่ท้ายไฟล์ไม่นับเป็นบรรทัดว่างเพิ่ม", K("a\n", "js") === "0" && K("a", "js") === "0");
{
  const r = countFile("src-tauri/src/x.rs", "fn a() {}\n\n#[cfg(test)]\nmod tests {\n    #[test]\n    fn t() {}\n}\n");
  check("rust โมดูลเทสที่เขียนในไฟล์ไปอยู่กลุ่มเทส Rust", JSON.stringify(r) === JSON.stringify({ rust: [1, 0, 1], rtest: [5, 0, 0] }), JSON.stringify(r));
  const r2 = countFile("src-tauri/src/y.rs", "fn a() {}\n#[cfg(test)]\n#[path = \"y_tests.rs\"]\nmod tests;\n");
  check("rust mod tests; ที่ชี้ไฟล์เทสแยก ยังนับเป็น Rust", JSON.stringify(r2) === JSON.stringify({ rust: [4, 0, 0] }), JSON.stringify(r2));
}

// ---------------------------------------------------------------- กลุ่มของไฟล์
const WANT = {
  "src/pages/settings/SettingsPage.tsx": "ui", "src/lib/api/core.ts": "ui", "src/styles/app/base.css": "style", "src/lib/langs.ts": "langs",
  "src-tauri/src/lib.rs": "rust", "src-tauri/build.rs": "rust", "src-tauri/src/app/latest_tests.rs": "rtest", "src-tauri/src/cover/link/tests.rs": "rtest",
  "scripts/check-ocr.mjs": "check", "scripts/web-shots.mjs": "script", "scripts/fetch-tools.ps1": "script", "scripts/run-av-all.sh": "script", "scripts/nsis-extract.py": "script", "vite.config.ts": "script",
  "docs/mockups/theme-live-app.html": "mock", "src/mockups/ocr/OcrMock.tsx": "mock", "CLAUDE.md": "doc", "docs/BUGS.md": "doc", "vendor/README.md": "doc",
  "src/generated/lineStats.json": null, "package.json": null, "docs/report-2026-11-09/a.png": null, "vendor/x.zip": null, "src/assets/thanks/ffmpeg.png": null, "node_modules/a/b.js": null,
};
const badG = Object.entries(WANT).filter(([p, g]) => groupOf(p) !== g).map(([p, g]) => `${p} ได้ ${groupOf(p)} ควรเป็น ${g}`);
check(`จัดกลุ่มไฟล์ถูก ${Object.keys(WANT).length} ตัวอย่าง`, !badG.length, badG.join(" | "));
check("มี 9 กลุ่ม ใช้งานจริงสี่กลุ่ม หน้าจอ สไตล์ Rust ข้อมูลภาษา", GROUPS.length === 9 && GROUPS.filter((g) => g.live).map((g) => g.id).join() === "ui,style,rust,langs");

// ---------------------------------------------------------------- ผลของตัวนับ (ไม่ใช้เมื่อพิสูจน์แดงด้วยไฟล์กติกาที่ผิด)
if (!process.env.LINECOUNT_LIB) {
  execFileSync("node", [process.env.LINESTATS_SCRIPT ? resolve(process.env.LINESTATS_SCRIPT) : join(ROOT, "scripts/line-stats.mjs")], { cwd: ROOT, stdio: "ignore" }); // LINESTATS_SCRIPT ใช้พิสูจน์ว่าแดงกับตัวนับที่ผิด
  const d = JSON.parse(readFileSync(join(ROOT, "src/generated/lineStats.json"), "utf8"));
  const git = (...a) => execFileSync("git", ["-c", "core.quotepath=off", ...a], { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28 });
  const commits = git("rev-list", "--first-parent", "--count", "HEAD").trim();
  check("นับครบทุก commit ของสายหลัก", d.ok && String(d.points.length) === commits, `${d.points.length} กับ ${commits}`);
  // บรรทัดรวม (โค้ด คอมเมนต์ ว่าง) ของ HEAD เท่าจำนวนบรรทัดจริงของไฟล์ในแต่ละกลุ่ม นับแยกจากตัวนับ
  const head = d.points.at(-1).n, real = {};
  for (const p of git("ls-tree", "-r", "-z", "--name-only", "HEAD").split("\0").filter(Boolean)) {
    const g = groupOf(p); if (!g) continue;
    const t = git("show", `HEAD:${p}`); const n = t === "" ? 0 : t.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").length;
    const key = g === "rust" || g === "rtest" ? "rs" : g; real[key] = (real[key] ?? 0) + n;
  }
  const got = {}; for (const [g, v] of Object.entries(head)) { const key = g === "rust" || g === "rtest" ? "rs" : g; got[key] = (got[key] ?? 0) + v[0] + v[1] + v[2]; }
  const bad = Object.keys({ ...real, ...got }).filter((k) => real[k] !== got[k]).map((k) => `${k} ${got[k]} กับ ${real[k]}`);
  check("บรรทัดรวมของ HEAD ทุกกลุ่มเท่าบรรทัดจริงของไฟล์", !bad.length, bad.join(" | "));
  // หมุดรุ่นตรงกับ commit ที่ขึ้นต้นด้วย vX.Y ทุกตัว
  const vCommits = git("log", "--first-parent", "--format=%h %s", "HEAD").split("\n").filter((l) => /^\w+ v\d+\.\d+/.test(l)).map((l) => l.split(" ")[0].slice(0, 7));
  const marks = new Set(d.points.filter((p) => p.vm).map((p) => p.h));
  const miss = vCommits.filter((h) => !marks.has(h));
  check(`หมุดรุ่นครบทุก commit ที่ขยับรุ่น (${vCommits.length} รุ่นที่ชื่อขึ้นต้นด้วย v)`, !miss.length, miss.join(" "));
  check("มีแถวงานในเครื่องตอนนี้ พร้อมเลขรุ่นจาก package.json", !!d.now?.n?.ui && d.now.v === JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version);
}

if (process.argv.includes("--ui")) { const { uiChecks } = await import("./check-line-stats-ui.mjs"); await uiChecks(check); }
console.log(`\nผ่าน ${pass} จาก ${pass + fails.length}`);
if (fails.length) { console.log("ข้อที่ตก"); for (const f of fails) console.log("  " + f); process.exit(1); }
