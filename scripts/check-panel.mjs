// ปุ่มแผงขวาของชั้นวาง ขอบปุ่มตรงกันทุกแถว ไอคอนกับตัวหนังสือตรงแนวในแต่ละคอลัมน์ (พี่กันสั่ง 9 พ.ย. 2569 "ขอ icon ให้ตรงกันที" · "เรียงตรงกันห่น่อย")
// ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-panel.mjs · ไม่กดปุ่มในแผง กดเฉพาะหนังบนชั้นเพื่อเปิดแผง
import { mkdirSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-09/แผงชั้นวาง";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };

await q("[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes('ชั้นวางหนัง')).click();");
await sleep(800);
await q("if (document.querySelector('[data-view=\"grid\"]')) document.querySelector('[data-view=\"grid\"]').click();");
const names = await q("return [...document.querySelectorAll('.book[data-movie]')].map((b) => b.dataset.movie);");
check("ชั้นวางมีเรื่องให้ตรวจ", names.length > 0, `${names.length} เรื่อง`);

const measure = `
  const r2 = (v) => Math.round(v * 10) / 10;
  const textLeft = (b) => { const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.textContent.trim()) { const g = document.createRange(); g.selectNodeContents(n); return g.getBoundingClientRect().left; } } return null; };
  const scope = [...document.querySelectorAll('.detail .actions .btn, .detail .minirow.half .btn')];
  return { state: document.querySelector('.detail .stat b')?.innerText ?? '', rows: scope.map((b) => { const x = b.getBoundingClientRect(), s = b.querySelector('svg')?.getBoundingClientRect(); return { t: b.textContent.trim(), left: r2(x.left), right: r2(x.right), icon: s ? r2(s.left - x.left) : null, iconW: s ? r2(s.width) : null, text: r2(textLeft(b) - x.left), over: b.scrollWidth > b.clientWidth, span: b.classList.contains('wide') }; }) };`;

const seen = new Set();
let shots = 0;
for (const n of names) {
  // กดเรื่องที่เลือกอยู่ซ้ำคือปิดแผง กดเฉพาะตอนยังไม่ได้เลือก
  if ((await q("return document.querySelector('.book.sel')?.dataset.movie ?? '';")) !== n) await c.book(n);
  await sleep(250);
  const m = await q(measure);
  const half = m.rows.filter((r) => !r.span);
  const lefts = [...new Set(half.map((r) => r.left))].sort((a, b) => a - b);
  const widths = [...new Set(half.map((r) => Math.round(r.right - r.left)))];
  const icons = [...new Set(m.rows.map((r) => r.icon))];
  const texts = [...new Set(m.rows.map((r) => r.text))];
  const over = m.rows.filter((r) => r.over).map((r) => r.t);
  const ok = lefts.length === 2 && widths.length === 1 && icons.length === 1 && texts.length === 1 && over.length === 0;
  const key = m.state + "|" + m.rows.length;
  if (!ok || !seen.has(key)) {
    check(`${n} · ${m.state} · ${m.rows.length} ปุ่ม`, ok, `ขอบซ้าย ${lefts.join(" ")} · กว้าง ${widths.join(" ")} · ไอคอนห่างขอบ ${icons.join(" ")} · ตัวหนังสือห่างขอบ ${texts.join(" ")}${over.length ? " · ล้นปุ่ม " + over.join(", ") : ""}`);
  }
  if (!seen.has(key)) {
    seen.add(key);
    shots += 1;
    await q("document.querySelector('.detail').scrollTop = 99999;");
    await sleep(150);
    await c.shot(`${OUT}/${String(shots).padStart(2, "0")}-${m.state.replace(/[\\/:*?"<>| ]+/g, "-") || "ไม่มีการ์ด"}.png`, ".detail");
    await q("document.querySelector('.detail').scrollTop = 0;");
  }
}
const pass = results.filter(Boolean).length;
console.log(`ผ่าน ${pass} ไม่ผ่าน ${results.length - pass}`);
c.close();
process.exit(results.every(Boolean) ? 0 : 1);
