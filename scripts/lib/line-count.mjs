// กติกานับบรรทัดของตัวนับบรรทัดโค้ด (BUGS ข้อ 160 · docs/PLAN-2026-11-27-นับบรรทัด.md)
// groupOf(ที่อยู่ไฟล์) บอกว่าไฟล์อยู่กลุ่มไหน ไม่นับคืน null
// countFile(ที่อยู่, เนื้อไฟล์) นับทุกบรรทัดเป็นสามชนิด โค้ดจริง คอมเมนต์ บรรทัดว่าง คืน { <กลุ่ม>: [โค้ด, คอมเมนต์, ว่าง] }
//   ไฟล์ Rust ที่มีโมดูลเทสเขียนในไฟล์ (ก่อนแบ่งไฟล์ 22 พ.ย. 2569) ส่วนเทสไปอยู่กลุ่มเทส Rust
// ตัวนับรู้จักสตริง ข้อความ "src/**/*.ts" ในโค้ดไม่ทำให้นับบรรทัดถัดไปเป็นคอมเมนต์ · บรรทัดที่มีโค้ดแล้วมีคอมเมนต์ต่อท้ายนับเป็นโค้ด

/** กลุ่มทั้งหมด เรียงตามที่แสดง · live คือส่วนที่อยู่ในโปรแกรมที่ติดตั้ง (ปุ่มลัด ใช้งานจริง) */
export const GROUPS = [
  { id: "ui", name: "หน้าจอ", live: true },
  { id: "style", name: "สไตล์", live: true },
  { id: "rust", name: "Rust", live: true },
  { id: "langs", name: "ข้อมูลภาษา", live: true },
  { id: "rtest", name: "เทส Rust", live: false },
  { id: "check", name: "ตัวตรวจ", live: false },
  { id: "script", name: "สคริปต์อื่น", live: false },
  { id: "mock", name: "มอคอัป", live: false },
  { id: "doc", name: "เอกสาร", live: false },
];

const CODE_EXT = /\.(mjs|cjs|js|ts|ps1|sh|py)$/;

/** กลุ่มของไฟล์จากที่อยู่ (ใช้ / เสมอ) · ไม่นับ คืน null */
export function groupOf(p) {
  if (p.startsWith("node_modules/") || /(^|\/)generated\//.test(p)) return null;
  if ((p.startsWith("vendor/") || p.startsWith("test-media/")) && !p.endsWith(".md")) return null;
  if (p.endsWith(".md")) return "doc";
  if (p.startsWith("src/mockups/") && /\.(tsx?|jsx?|css|html)$/.test(p)) return "mock";
  if (p.startsWith("docs/mockups/") && /\.(tsx?|jsx?|mjs|css|html)$/.test(p)) return "mock";
  if (p === "src/lib/langs.ts") return "langs";
  if (p.startsWith("src/") && /\.tsx?$/.test(p) && !p.startsWith("src/generated/")) return "ui";
  if (p.startsWith("src/") && p.endsWith(".css")) return "style";
  if (/^src-tauri\/src\/.*(_tests|\/tests)\.rs$/.test(p)) return "rtest";
  if (p.startsWith("src-tauri/src/") && p.endsWith(".rs") || p === "src-tauri/build.rs") return "rust";
  if (/^scripts\/(.*\/)?check-[^/]*\.mjs$/.test(p)) return "check";
  if (p.startsWith("scripts/") && CODE_EXT.test(p)) return "script";
  if (!p.includes("/") && /\.(ts|mjs|js|cjs)$/.test(p)) return "script"; // ไฟล์ตั้งค่าที่เป็นโค้ดระดับบนสุด เช่น vite.config.ts
  return null;
}

/** ภาษาของไฟล์ เลือกตัวนับ */
function langOf(p) {
  if (p.endsWith(".rs")) return "rust";
  if (p.endsWith(".css")) return "css";
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(p)) return "js";
  if (p.endsWith(".html")) return "html";
  if (p.endsWith(".md")) return "md";
  if (p.endsWith(".ps1")) return "ps1";
  return "hash"; // sh py
}

/** ชนิดของแต่ละบรรทัด 0 โค้ด 1 คอมเมนต์ 2 ว่าง */
export function kinds(text, lang) {
  const L = text.replace(/\r\n?/g, "\n").split("\n");
  if (L.length && L[L.length - 1] === "") L.pop(); // ขึ้นบรรทัดใหม่ท้ายไฟล์ไม่ใช่บรรทัด
  if (lang === "md" || lang === "html") return markupKinds(L, lang);
  if (lang === "hash" || lang === "ps1") return hashKinds(L, lang === "ps1");
  return cKinds(L, lang);
}

/** md กับ html · คอมเมนต์ <!-- --> · html ในบล็อก script กับ style นับบรรทัดที่ขึ้นต้นด้วยคอมเมนต์แบบ js ด้วย */
function markupKinds(L, lang) {
  const out = []; let inHtml = false, inJs = false, inBlock = false;
  for (const raw of L) {
    const t = raw.trim();
    if (inHtml) { out.push(1); if (t.includes("-->")) inHtml = false; continue; }
    if (inBlock) { out.push(1); if (t.includes("*/")) inBlock = false; continue; }
    if (!t) { out.push(2); continue; }
    if (t.startsWith("<!--")) { out.push(1); if (!t.includes("-->", 4)) inHtml = true; continue; }
    if (lang === "html") {
      if (/<(script|style)\b/i.test(t) && !/<\/(script|style)>/i.test(t)) inJs = true;
      else if (/<\/(script|style)>/i.test(t)) inJs = false;
      else if (inJs && t.startsWith("//")) { out.push(1); continue; }
      else if (inJs && t.startsWith("/*")) { out.push(1); if (!t.includes("*/", 2)) inBlock = true; continue; }
    }
    out.push(0);
  }
  return out;
}

/** sh py ps1 · คอมเมนต์คือบรรทัดที่ขึ้นต้นด้วย # (ไม่นับ #! บรรทัดแรก) · ps1 มีบล็อก <# #> */
function hashKinds(L, ps1) {
  const out = []; let inBlock = false;
  L.forEach((raw, i) => {
    const t = raw.trim();
    if (inBlock) { out.push(1); if (t.includes("#>")) inBlock = false; return; }
    if (!t) { out.push(2); return; }
    if (ps1 && t.startsWith("<#")) { out.push(1); if (!t.includes("#>", 2)) inBlock = true; return; }
    if (t.startsWith("#") && !(i === 0 && t.startsWith("#!"))) { out.push(1); return; }
    out.push(0);
  });
  return out;
}

/** js ts tsx css rs · ไล่ทีละตัวอักษร รู้จักสตริง คอมเมนต์บล็อก และคอมเมนต์ในวงเล็บปีกกาของ JSX */
function cKinds(L, lang) {
  const out = [];
  let block = false;      // อยู่ในคอมเมนต์บล็อก
  let jsxBlock = false;   // คอมเมนต์บล็อกที่เปิดด้วยวงเล็บปีกกาของ JSX ปิดแล้วข้ามวงเล็บปิดด้วย
  let str = "";           // อยู่ในสตริง ตัวปิด (` ของ js หรือ " ของ rust ข้ามบรรทัดได้)
  let rawHash = -1;       // สตริงดิบ r#"…"# ของ rust จำนวน #
  for (const line of L) {
    const startedInStr = !!str || rawHash >= 0;
    let code = false, comment = false;
    let i = 0;
    const n = line.length;
    while (i < n) {
      const ch = line[i];
      if (block) {
        comment = true;
        const e = line.indexOf("*/", i);
        if (e < 0) { i = n; break; }
        block = false; i = e + 2;
        if (jsxBlock) { jsxBlock = false; const m = /^\s*\}/.exec(line.slice(i)); if (m) i += m[0].length; }
        continue;
      }
      if (rawHash >= 0) { // สตริงดิบของ rust ปิดด้วย " ตามด้วย # เท่าจำนวนตอนเปิด
        code = true;
        const close = '"' + "#".repeat(rawHash);
        const e = line.indexOf(close, i);
        if (e < 0) { i = n; break; }
        rawHash = -1; i = e + close.length; continue;
      }
      if (str) {
        code = true;
        if (ch === "\\") { i += 2; continue; }
        if (ch === str) { str = ""; i++; continue; }
        if (str === "`" && ch === "$" && line[i + 1] === "{") { i += 2; continue; } // ${…} นับเป็นโค้ดในสตริง ไม่ลึกกว่านี้
        i++; continue;
      }
      if (ch === " " || ch === "\t") { i++; continue; }
      if (ch === "/" && line[i + 1] === "/" && lang !== "css") { comment = true; break; }
      if (ch === "/" && line[i + 1] === "*") { block = true; comment = true; i += 2; continue; }
      if (ch === "{" && lang === "js" && /^\{\s*\/\*/.test(line.slice(i))) { // คอมเมนต์ในวงเล็บปีกกาของ JSX
        const j = line.indexOf("/*", i); block = true; jsxBlock = true; comment = true; i = j + 2; continue;
      }
      if (lang === "rust" && ch === "r" && /^r#*"/.test(line.slice(i)) && !/[A-Za-z0-9_]/.test(line[i - 1] ?? "")) {
        const m = /^r(#*)"/.exec(line.slice(i)); code = true; rawHash = m[1].length; i += m[0].length; continue;
      }
      if (ch === '"' || ch === "`" && lang === "js" || ch === "'" && lang !== "rust") { code = true; str = ch; i++; continue; }
      if (ch === "'" && lang === "rust") { // ตัวอักษร 'x' '\n' ข้ามทั้งก้อน ส่วน 'a ของอายุตัวแปรเป็นโค้ดธรรมดา
        const m = /^'(\\.[^']*|[^\\'])'/u.exec(line.slice(i)); code = true; i += m ? m[0].length : 1; continue;
      }
      if (ch === "/" && lang === "js" && isRegexStart(line, i)) { code = true; i = skipRegex(line, i); continue; }
      code = true; i++;
    }
    if (lang === "js" && (str === "'" || str === '"')) str = ""; // สตริงธรรมดาของ js ไม่ข้ามบรรทัด กันเครื่องหมาย ' ในข้อความ JSX
    if (lang === "css") str = "";
    out.push(code ? 0 : comment ? 1 : startedInStr ? 0 : 2);
  }
  return out;
}

/** / ตรงนี้เป็นจุดเริ่ม regex ไหม (ดูตัวที่อยู่ก่อน) */
function isRegexStart(line, i) {
  const next = line[i + 1];
  if (next === "/" || next === "*" || next === undefined) return false;
  let j = i - 1; while (j >= 0 && (line[j] === " " || line[j] === "\t")) j--;
  if (j < 0) return true;
  if ("(,=:[!&|?{};+-*%<>~^".includes(line[j])) return true;
  return /\b(return|typeof|case|in|of|void|delete)$/.test(line.slice(0, j + 1));
}
function skipRegex(line, i) {
  let k = i + 1, cls = false;
  while (k < line.length) {
    const c = line[k];
    if (c === "\\") { k += 2; continue; }
    if (c === "[") cls = true; else if (c === "]") cls = false;
    else if (c === "/" && !cls) { k++; while (/[a-z]/i.test(line[k] ?? "")) k++; return k; }
    k++;
  }
  return line.length;
}

/** ช่วงบรรทัดของโมดูลเทสที่เขียนในไฟล์ Rust · #[cfg(test)] ตามด้วย mod x { ที่ไม่ย่อหน้า จบที่ } ไม่ย่อหน้าตัวแรก */
function rustTestLines(L) {
  const set = new Set();
  for (let i = 0; i < L.length; i++) {
    if (L[i].trim() !== "#[cfg(test)]" || /^\s/.test(L[i])) continue;
    let k = i + 1; while (k < L.length && (L[k].trim() === "" || L[k].trim().startsWith("#["))) k++;
    if (!/^(pub(\([a-z]+\))?\s+)?mod\s+\w+\s*\{\s*$/.test(L[k] ?? "")) continue;
    let e = k + 1; while (e < L.length && L[e] !== "}") e++;
    for (let x = i; x <= Math.min(e, L.length - 1); x++) set.add(x);
    i = e;
  }
  return set;
}

/** นับไฟล์หนึ่งไฟล์ คืน { <กลุ่ม>: [โค้ด, คอมเมนต์, ว่าง] } · ไม่นับคืน null */
export function countFile(p, text) {
  const g = groupOf(p);
  if (!g) return null;
  const lang = langOf(p);
  const ks = kinds(text, lang);
  const res = { [g]: [0, 0, 0] };
  const tests = g === "rust" ? rustTestLines(text.replace(/\r\n?/g, "\n").split("\n")) : null;
  ks.forEach((k, i) => {
    const to = tests && tests.has(i) ? "rtest" : g;
    (res[to] ??= [0, 0, 0])[k]++;
  });
  return res;
}
