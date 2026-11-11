// ตัวตรวจบั๊กชุด 8 หน้ากราฟเสียง แปลงเสียง ข้อ 26 27 (docs/BUGS.md จัดหมวด 11 พ.ย. 2569)
// เปิดโปรแกรมโหมดพัฒนาก่อน · ไม่กดปุ่มแปลง ไม่กดเลือกไฟล์ · คิวเดิมต้องว่าง (ไม่ลบคิวของพี่กัน) · ภาพลง docs/report-2026-11-11/ชุด8/
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync } from "node:fs";

const ROOT = "D:/movie-shelf";
const OUT = `${ROOT}/docs/report-2026-11-11/ชุด8`; mkdirSync(OUT, { recursive: true });
const D = `${ROOT}/test-media/สร้าง/เสียงซับ`;
const FILES = ["เพลงทดสอบ.wav", "เพลงทดสอบ.mp3", "เพลงทดสอบ.opus", "เพลงทดสอบ 96k.flac", "ดาวตก (2024) PAL 25fps.ac3", "ดาวตก (2024) พากย์ไทย DELAY -120ms.ac3", "ดาวตก (2024).mkv"].map((f) => `${D}/${f}`);
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const G = "[data-pageslot=graph]";
const nav = async (label) => { await q(`[...document.querySelectorAll("button,a")].find(b => b.innerText.trim().split(/\\s*\\n/)[0] === ${JSON.stringify(label)})?.click()`); await sleep(500); };
const drop = (paths) => c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: ${JSON.stringify(paths)}, position: { x: 700, y: 400 } } })`);

await nav("กราฟเสียง");
await q(`[...document.querySelectorAll('${G} button')].find((b) => b.innerText.trim() === 'หน้ารวม')?.click()`); await sleep(800);
await q(`document.querySelector('${G} [data-gmode=convert]')?.click()`); await sleep(800);
const had = await q(`return document.querySelectorAll('${G} [data-qrow]').length`);
if (had) { console.log(`คิวมีไฟล์อยู่ ${had} ไฟล์ ไม่ลบคิวเดิม ข้ามข้อ 26`); }
else {
  const geo = () => q(`const g = (s) => { const e = document.querySelector('${G} ' + s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)]; }; const l = document.querySelector('${G} [data-qlist]'); return { drop: g('[data-qdrop]'), cards: g('.cqcards'), foot: g('.cqfoot'), list: g('[data-qlist]'), listScroll: l ? l.scrollHeight > l.clientHeight + 1 : false, inner: innerHeight, pageScroll: (() => { const w = document.querySelector('${G} .pagewrap'); return w ? w.scrollHeight > w.clientHeight + 1 : null; })() }`);
  const out = {};
  for (const [n, add] of [[1, FILES.slice(0, 1)], [3, FILES.slice(1, 3)], [7, FILES.slice(3, 7)]]) {
    await drop(add); await sleep(2500);
    out[n] = await geo();
    await c.shot(`${OUT}/26-คิว-${n}-ไฟล์.png`, `${G} [data-convert]`, 0);
  }
  const dropH = [out[1].drop[1], out[3].drop[1], out[7].drop[1]];
  check("ข้อ 26 จุดลากสูงเท่ากันทุกจำนวนไฟล์ (1 3 7 ไฟล์)", new Set(dropH).size === 1, JSON.stringify(dropH));
  const footBottom = (o) => o.foot[0] + o.foot[1];
  check("ข้อ 26 ส่วนตั้งค่ากับปุ่มแปลงอยู่ล่างจอทุกจำนวนไฟล์ ไม่ต้องเลื่อนหน้า", [1, 3, 7].every((k) => footBottom(out[k]) <= out[k].inner && footBottom(out[k]) >= out[k].inner - 40 && out[k].pageScroll === false), JSON.stringify([1, 3, 7].map((k) => [footBottom(out[k]), out[k].inner, out[k].pageScroll])));
  console.log("ขนาด", JSON.stringify(out));
  // ---------- ข้อ 27 ดรอปดาวน์แบ่งกลุ่ม หัวย่อย ช่องค้น ----------
  await q(`document.querySelector('${G} [data-qrow] .dd')?.click()`); await sleep(500);
  const dd = await q(`const m = document.querySelector('body > [role=listbox]'); if (!m) return null; const r = m.getBoundingClientRect(); return { groups: [...m.querySelectorAll('.ddgroup')].map((e) => e.innerText), subs: [...m.querySelectorAll('.ddsub')].map((e) => e.innerText), search: !!m.querySelector('[data-ddsearch]'), focus: document.activeElement?.hasAttribute('data-ddsearch'), top: Math.round(r.top), bottom: Math.round(r.bottom), h: innerHeight, hit: m.contains(document.elementFromPoint(r.left + r.width / 2, Math.min(r.bottom - 10, innerHeight - 5))) }`);
  check("ข้อ 27 ดรอปดาวน์มีหัวกลุ่ม เสียคุณภาพ ไม่เสียคุณภาพ · หัวย่อยตามชนิดรวม ALAC · ช่องค้นบนสุดได้โฟกัส · ไม่ล้นจอ · ไม่โดนกรอบรายการคิวตัด", !!dd && dd.groups.join("|") === "เสียคุณภาพ|ไม่เสียคุณภาพ" && dd.subs.includes("ALAC") && dd.search && dd.focus && dd.bottom <= dd.h && dd.top >= 0 && dd.hit, JSON.stringify(dd));
  await c.shot(`${OUT}/27-ดรอปดาวน์แบ่งกลุ่ม.png`, `body > [role=listbox]`, 4).catch(() => {});
  await c.type("alac"); await sleep(400);
  const found = await q(`return [...document.querySelectorAll('body > [role=listbox] [role=option]')].map((e) => e.innerText.trim())`);
  check("ข้อ 27 พิมพ์ alac เหลือเฉพาะตัวเลือก ALAC", found.length > 0 && found.every((t) => t.startsWith("ALAC")), found.join(" | "));
  await c.shot(`${OUT}/27-ค้น-alac.png`, `body > [role=listbox]`, 4).catch(() => {});
  await c.key("Enter"); await sleep(400);
  const chosen = await q(`return document.querySelector('${G} [data-qrow] .dd')?.innerText.trim()`);
  check("ข้อ 27 กด Enter เลือกตัวแรกที่ค้นเจอ ปลายทางเป็น ALAC", /^ALAC/.test(chosen ?? ""), chosen);
  // เอาไฟล์ทดสอบออกจากคิว คืนคิวว่าง (ไฟล์ในเครื่องไม่ถูกแตะ)
  for (let i = 0; i < 10; i++) { const r = await q(`const b = document.querySelector('${G} [data-qremove]'); if (b) b.click(); return !!b`); if (!r) break; await sleep(150); }
}

console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
process.exit(fail ? 1 : 0);
