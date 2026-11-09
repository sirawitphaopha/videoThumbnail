// ลองแบบให้เลือกกับชื่อไฟล์ยาวและโทนอื่น ของจริงบนโปรแกรม ไม่เด้งขึ้นจอ · ใช้: เปิด scripts/dev-app.ps1 ก่อน
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";
import { DROP, PICK } from "../docs/mockups/pick-variants.mjs";

const OUT = "docs/report-2026-11-09/มอคอัป-เลือก";
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const waitFor = async (js, ms = 30000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = async (l) => { await q(`[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes(${JSON.stringify(l)})).click();`); await sleep(600); };
const style = (kind, v) => q(`let el = document.getElementById('${kind}-style'); if (!el) { el = document.createElement('style'); el.id = '${kind}-style'; document.head.appendChild(el); } el.textContent = ${JSON.stringify(v.css)};`);
const by = (list, id) => list.find((v) => v.id === id);

/* ---------- ชื่อไฟล์ยาว ---------- */
const TMP = "D:/dev/tmp/ชั้นชื่อยาว";
rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true });
const names = { "กลาง": "ดาวเหนือ ฉบับผู้กำกับ (2023) 1080p BluRay.mkv", "ยาว": "ดาวเหนือ ฉบับผู้กำกับตัดต่อใหม่ (2023) 2160p UHD BluRay REMUX HEVC DTS-HD MA 7.1-TEAM.mkv" };
for (const [k, n] of Object.entries(names)) {
  const p = join(TMP, n);
  copyFileSync(resolve("test-media", "สร้าง", "หนัง", "ดาวเหนือ (2023).mkv"), p);
  const seed = [{ path: p.replace(/\//g, "\\"), name: n, size: 1, duration: 20, audioOnly: false, layout: "1.0", at: 1 }];
  await q(`localStorage.setItem('graph-recent', ${JSON.stringify(JSON.stringify(seed))}); location.reload();`).catch(() => null);
  await sleep(3000); await waitFor("return !!document.querySelector('.nav');");
  await nav("กราฟเสียง");
  await q("document.querySelector('[data-graphhome]')?.click();");
  await waitFor("return !!document.querySelector('[data-graphrecentpick]');");
  await q("document.querySelector('[data-graphrecentpick]').click();");
  await waitFor("return !!document.querySelector('[data-view]');", 60000);
  await q("document.querySelector('[data-view=spek]').click();");
  await waitFor("return !!document.querySelector('[data-spek]');", 90000); await sleep(800);
  for (const v of PICK.filter((x) => x.id !== "now")) {
    await style("pick", v); await sleep(400);
    const m = await q(`const cv = document.querySelector('[data-spek]').getBoundingClientRect(), p = document.querySelector('[data-plottools]').getBoundingClientRect(); const g = document.createElement('canvas').getContext('2d'); g.font = '700 13.5px Sarabun, sans-serif'; const end = 62 + g.measureText(${JSON.stringify(n)}).width; return { ปลายชื่อ: Math.round(end), ปุ่มเริ่ม: Math.round(p.left - cv.left), ชน: end > p.left - cv.left };`);
    console.log(`ชื่อ${k} แบบ ${v.id}`, JSON.stringify(m));
    if (k === "ยาว" && (v.id === "a" || v.id === "b")) await c.shot(`${OUT}/สี-${v.id}-ชื่อยาว.png`, "[data-plot]", 0);
  }
  await style("pick", PICK[0]);
}
await q("document.querySelector('[data-view=wave]').click();");
await q("localStorage.removeItem('graph-recent'); location.reload();").catch(() => null);
await sleep(3000); await waitFor("return !!document.querySelector('.nav');");
rmSync(TMP, { recursive: true, force: true });

/* ---------- โทนอื่น ---------- */
const before = await q("return localStorage.getItem('ms.tone') ?? 'quartz';");
await nav("ใส่โปสเตอร์");
for (const t of ["wine", "night", "sage", "mauve"]) {
  await q(`window.__applyTone(${JSON.stringify(t)});`);
  for (const id of t === "night" ? ["a", "b", "c", "d"] : ["b"]) {
    await style("drop", by(DROP, id)); await sleep(500);
    await c.shot(`${OUT}/ลาก-${id}-โทน-${t}.png`);
  }
}
await style("drop", DROP[0]);
await q(`window.__applyTone(${JSON.stringify(before)});`);
console.log("โทนคืนเป็น", before);
c.close();
