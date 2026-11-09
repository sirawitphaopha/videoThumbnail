// ช่องตัวอย่างหน้าใส่โปสเตอร์ ขอบล่างตรงช่องลากไฟล์ กึ่งกลาง เต็มความสูง ทุกขนาดหน้าต่าง · ใช้: เปิด scripts/dev-app.ps1 ก่อน
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";
const OUT = "docs/report-2026-11-09/จุดลากไฟล์";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push({ name, ok: !!ok, note: String(note) }); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
await q("[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes('ใส่โปสเตอร์')).click();");
await sleep(800);
// เริ่มจากหน้าว่าง ตัวตรวจชุดก่อนอาจทิ้งไฟล์ไว้
const clear = async () => { await q("[...document.querySelectorAll('[data-poster-page] .btn')].find((b) => b.textContent.includes('ล้างทั้งหมด'))?.click();"); await sleep(500); await q("[...document.querySelectorAll('.dialog .btn, [role=dialog] .btn')].find((b) => /ล้าง/.test(b.textContent))?.click();"); await sleep(500); };
await clear();
const look = () => q(`const R = (s) => document.querySelector(s).getBoundingClientRect(); const d = R('[data-drop=poster]'), m = R('[data-card=result] .mc'), k = R('[data-card=result]'), cs = getComputedStyle(document.querySelector('[data-card=result]')), pad = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight), page = document.querySelector('[data-poster-page]'); return { cardBottom: k.bottom, dropTop: d.top, mcTop: m.top, dropBottom: d.bottom, mcBottom: m.bottom, ratio: m.width / m.height, centerGap: Math.abs((m.left + m.right) / 2 - ((k.left + pad) + (k.right - pr)) / 2), scroll: page.scrollHeight - page.clientHeight, w: innerWidth, h: innerHeight };`);
const sizes = [[1280, 800], [1100, 700], [1600, 1000], [1920, 1040]];
for (const [w, h] of sizes) {
  await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(500);
  const m = await look();
  check(`${w} × ${h} ขอบบนตรงช่องลากไฟล์ ขอบล่างกรอบหรือการ์ดตรงช่องลาก`, Math.abs(m.mcTop - m.dropTop) <= 1 && (Math.abs(m.mcBottom - m.dropBottom) <= 1 || (m.mcBottom < m.dropBottom && Math.abs(m.cardBottom - m.dropBottom) <= 1)), `บน ${Math.round(m.mcTop)} กับ ${Math.round(m.dropTop)} · ล่าง ${Math.round(m.mcBottom)} กับ ${Math.round(m.dropBottom)}`);
  check(`${w} × ${h} กึ่งกลางคอลัมน์ สัดส่วน 2:3`, m.centerGap <= 1 && Math.abs(m.ratio - 2 / 3) < 0.01, `ห่าง ${m.centerGap.toFixed(1)} สัดส่วน ${m.ratio.toFixed(3)}`);
  await c.shot(`${OUT}/08-ช่องตัวอย่าง-${w}.png`);
}
await c.send("Emulation.clearDeviceMetricsOverride"); await sleep(400);
/* ใส่ไฟล์หนังแล้ว ยังไม่มีรูป */
const movie = resolve("test-media", "สร้าง", "หนัง", "Clip (2015).flv");
await c.evaluate(`(() => { const r = document.querySelector('[data-drop=movie]').getBoundingClientRect(); window.__posterDrop([${JSON.stringify(movie)}], (r.left + 20) * devicePixelRatio, (r.top + 20) * devicePixelRatio); })()`);
const t0 = Date.now(); while (Date.now() - t0 < 20000 && !(await q("return !!document.querySelector('[data-moviefirst]');"))) await sleep(200);
await sleep(500);
const lm = await look();
check("ใส่ไฟล์หนังแล้ว ขอบบนกับขอบล่างยังตรงช่องลากรูป", Math.abs(lm.mcTop - lm.dropTop) <= 1 && Math.abs(lm.mcBottom - lm.dropBottom) <= 1, `บน ${Math.round(lm.mcTop)} กับ ${Math.round(lm.dropTop)} · ล่าง ${Math.round(lm.mcBottom)} กับ ${Math.round(lm.dropBottom)}`);
const hint = await q("const b = document.querySelector('[data-moviefirst]'), d = document.querySelector('[data-drop=poster]'), bt = [...document.querySelectorAll('[data-card=poster] .drop span .btn')].map((x) => Math.round(x.getBoundingClientRect().top)); return { inside: d.contains(b), oneRow: new Set(bt).size === 1, n: bt.length };");
check("บรรทัดบอกเหตุอยู่ในช่องลาก ปุ่มสองปุ่มแถวเดียว", hint.inside && hint.oneRow && hint.n === 2, JSON.stringify(hint));
const t1 = Date.now(); while (Date.now() - t1 < 20000 && !(await q("return document.querySelector('[data-moviethumb]')?.naturalWidth > 0;"))) await sleep(200);
const th = await q("const e = document.querySelector('[data-moviethumb]'), r = e.getBoundingClientRect(), k = document.querySelector('[data-card=movie]').getBoundingClientRect(), v = document.querySelector('[data-drop=movie]').getBoundingClientRect(), d = document.querySelector('[data-drop=poster]').getBoundingClientRect(); return { tag: e.tagName, nat: e.naturalWidth ?? 0, w: Math.round(r.width), h: Math.round(r.height), cardW: Math.round(k.width), vBottom: v.bottom, dBottom: d.bottom };");
check("รูปตัวอย่างหนังเต็มคอลัมน์ ใช้ภาพจริงจากหนัง", th.tag === "IMG" && th.nat > 0 && th.w >= th.cardW - 30, JSON.stringify(th));
check("ใส่ไฟล์หนังแล้วหน้าไม่เลื่อน", lm.scroll <= 0, `เลื่อนได้ ${lm.scroll}`);
await c.shot(`${OUT}/09-ช่องตัวอย่าง-ใส่หนังแล้ว.png`);
await clear();
/* ชนิดวิดีโอจากไฟล์จริง */
const kinds = [["ดาวเหนือ (2023).mkv", "H.264", /AAC/], ["HEVC Test (2020).mkv", "H.265", /./], ["ฝนแรก (2025).webm", "VP9", /Opus|Vorbis/i], ["Old Disc (2001).vob", "MPEG-2", /./], ["Vorbis Test (2010).mkv", "", /Vorbis/i]];
for (const [name, want, aud] of kinds) {
  const p = resolve("test-media", "สร้าง", "หนัง", name);
  await c.evaluate(`(() => { const r = document.querySelector('[data-drop=movie]').getBoundingClientRect(); window.__posterDrop([${JSON.stringify(p)}], (r.left + 20) * devicePixelRatio, (r.top + 20) * devicePixelRatio); })()`);
  const t2 = Date.now(); while (Date.now() - t2 < 20000 && !(await q("return !!document.querySelector('[data-moviecodec]');"))) await sleep(150);
  const got = await q("return document.querySelector('[data-moviecodec]')?.textContent ?? '';");
  if (want) check(`${name} ขึ้นชนิด ${want}`, got === want, got);
  const a = await q("return document.querySelector('[data-movieaudio]')?.textContent ?? '';");
  check(`${name} ขึ้นชนิดเสียง`, aud.test(a), a);
  if (want === "H.265") await c.shot(`${OUT}/10-ชนิดวิดีโอ.png`, "[data-card=movie]", 0);
  await clear();
}
await q("[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes('ชั้นวางหนัง')).click();");
const pass = results.filter((r) => r.ok).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
writeFileSync(`${OUT}/ผลเทส-ช่องตัวอย่าง.json`, JSON.stringify(results, null, 1));
c.close();
process.exitCode = pass === results.length ? 0 : 1;
