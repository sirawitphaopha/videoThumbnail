// เทียบภาพสองชุดจาก web-shots.mjs ทีละจุดภาพ (แผนแบ่งไฟล์ขั้น 0.4 · BUGS ข้อ 153)
// ใช้:  node scripts/web-diff.mjs <ชุดก่อน> <ชุดหลัง> [โฟลเดอร์ภาพที่ต่าง]
// ผ่านเมื่อ ภาพชื่อเดียวกันไม่มีจุดภาพที่สีห่างกันเกิน 6 ระดับ (จาก 255) และสองชุดมีภาพครบชื่อเดียวกัน
// จุดที่สีห่างกันไม่เกิน 6 ระดับ (TOL) นับแยกเป็นสัญญาณรบกวนของตัววาด เช่นมุมมนของวงแหวนเงารอบการ์ดที่เลือกในหน้าตั้งค่า เสียงและซับ ที่บางรอบห่างถึง 5 ระดับ ไม่ใช่หน้าตาเปลี่ยน
// (ขยับของ 1 จุดภาพ สีห่างกันหลายสิบระดับ เจอตอนพิสูจน์ 1,021 จุดภาพ) · TOL=0 ใช้เทียบแบบเข้มทุกจุดภาพ
// ภาพที่ต่าง ทำภาพเทียบลงโฟลเดอร์ที่สาม (ค่าตั้งต้น <ชุดหลัง>/ต่าง) จุดที่ต่างเป็นสีแดงบนภาพหลังที่จางลง พร้อมกรอบล้อมบริเวณที่ต่าง
// ถอดภาพด้วย Chromium ที่ติดมากับ Playwright ไม่ต้องลงไลบรารีเพิ่ม
import { createRequire } from "module";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const { chromium } = createRequire(import.meta.url)("playwright");
const [A, B, OUT0] = process.argv.slice(2);
if (!A || !B) { console.error("ใช้ node scripts/web-diff.mjs <ชุดก่อน> <ชุดหลัง>"); process.exit(2); }
const OUT = OUT0 ?? join(B, "ต่าง");
const TOL = Number(process.env.TOL ?? 6);
const pngs = (d) => readdirSync(d).filter((f) => f.endsWith(".png")).sort();
const a = pngs(A), b = new Set(pngs(B));
const onlyA = a.filter((f) => !b.has(f)), onlyB = [...b].filter((f) => !a.includes(f));
if (!a.length && !b.size) { console.error("ไม่มีภาพในทั้งสองชุด ตรวจที่อยู่โฟลเดอร์"); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
const fails = [], noisy = [];
let same = 0;
for (const f of a.filter((x) => b.has(x))) {
  const da = readFileSync(join(A, f)), db = readFileSync(join(B, f));
  if (da.equals(db)) { same++; continue; }
  const r = await page.evaluate(async ([x, y, tol]) => {
    const load = async (b64) => { const bm = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob()); const c = new OffscreenCanvas(bm.width, bm.height); const g = c.getContext("2d"); g.drawImage(bm, 0, 0); return { w: bm.width, h: bm.height, d: g.getImageData(0, 0, bm.width, bm.height).data, c }; };
    const p = await load(x), q = await load(y);
    if (p.w !== q.w || p.h !== q.h) return { n: -1, size: `${p.w}x${p.h} กับ ${q.w}x${q.h}` };
    let n = 0, noise = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    const out = new ImageData(q.w, q.h);
    for (let i = 0; i < p.d.length; i += 4) {
      const m = Math.max(Math.abs(p.d[i] - q.d[i]), Math.abs(p.d[i + 1] - q.d[i + 1]), Math.abs(p.d[i + 2] - q.d[i + 2]), Math.abs(p.d[i + 3] - q.d[i + 3]));
      if (m > 0 && m <= tol) noise++;
      const diff = m > tol;
      if (diff) { n++; const k = i / 4, px = k % q.w, py = (k / q.w) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; out.data[i] = 230; out.data[i + 1] = 20; out.data[i + 2] = 40; out.data[i + 3] = 255; }
      else { out.data[i] = 255 - (255 - q.d[i]) * 0.35; out.data[i + 1] = 255 - (255 - q.d[i + 1]) * 0.35; out.data[i + 2] = 255 - (255 - q.d[i + 2]) * 0.35; out.data[i + 3] = 255; }
    }
    if (!n) return { n: 0, noise };
    const c = new OffscreenCanvas(q.w, q.h), g = c.getContext("2d");
    g.putImageData(out, 0, 0); g.strokeStyle = "rgb(230,20,40)"; g.lineWidth = 2; g.strokeRect(x0 - 4, y0 - 4, x1 - x0 + 9, y1 - y0 + 9);
    const blob = await c.convertToBlob({ type: "image/png" });
    const buf = new Uint8Array(await blob.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { n, box: [x0, y0, x1, y1], png: btoa(s) };
  }, [da.toString("base64"), db.toString("base64"), TOL]);
  if (r.n === 0) { same++; if (r.noise) noisy.push(`${f} ${r.noise} จุดภาพ`); continue; }
  if (r.n < 0) { fails.push(`${f} ขนาดภาพไม่เท่ากัน ${r.size}`); continue; }
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, f), Buffer.from(r.png, "base64"));
  fails.push(`${f} ต่าง ${r.n.toLocaleString("en-US")} จุดภาพ บริเวณ x ${r.box[0]}–${r.box[2]} y ${r.box[1]}–${r.box[3]}`);
}
await browser.close();
for (const f of onlyA) fails.push(`${f} มีแต่ในชุดก่อน`);
// คำสั่งที่หน้าจำลองไม่มีข้อมูล (.missing.txt) ต้องเหมือนกันสองชุด ชื่อคำสั่งที่พังหรือเปลี่ยน หน้าอาจขึ้นสภาพว่างที่หน้าตาเหมือนเดิม (ผู้ช่วยตรวจทานขั้น 13.5)
const miss = (d, f) => { const p = join(d, f + ".missing.txt"); return existsSync(p) ? readFileSync(p, "utf8").trim() : ""; };
for (const f of a.filter((x) => b.has(x))) { const x = miss(A, f), y = miss(B, f); if (x !== y) fails.push(`${f} คำสั่งที่หน้าจำลองไม่มีข้อมูลต่างกัน ก่อน [${x.replace(/\n/g, " ")}] หลัง [${y.replace(/\n/g, " ")}]`); }
for (const f of onlyB) fails.push(`${f} มีแต่ในชุดหลัง`);
console.log(`ภาพตรงกัน ${same} จาก ${a.length + onlyB.length} ภาพ` + (noisy.length ? ` (ในนั้น ${noisy.length} ภาพมีสัญญาณรบกวนสีห่างไม่เกิน ${TOL} ระดับ ${noisy.join(" · ")})` : " ทุกจุดภาพ"));
if (fails.length) { console.log(`ไม่ตรง ${fails.length} ภาพ ภาพเทียบอยู่ ${OUT}`); for (const f of fails) console.log("  " + f); process.exit(1); }
