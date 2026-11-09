// เมนูย่อกับขยาย ไอคอนทุกตัวยังอยู่ครบ ขนาดเท่าเดิม ไม่กระโดด · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-nav.mjs · คืนสถานะเดิมตอนจบ
// เกิดจริง 9 พ.ย. 2569 โลโก้ถูกบีบหายตอนย่อ ตัววัดเดิมดูแค่ตำแหน่ง จึงต้องวัดความกว้างด้วย
import { mkdirSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";
const OUT = "docs/report-2026-11-09/เมนูย่อขยาย";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})});`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const icons = () => q(`const side = document.querySelector('[data-navbar]'), s = side.getBoundingClientRect(); return [...side.querySelectorAll('.brand svg, .nav svg')].map((i) => { const r = i.getBoundingClientRect(); return { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, x: Math.round(r.left * 10) / 10, ในแถบ: r.left >= s.left && r.right <= s.right }; });`);
const before = (await inv("get_settings")).settings;
try {
  await inv("set_settings", { patch: { sidebarCollapsed: false } });
  await q("location.reload();").catch(() => null);
  await sleep(2500);
  for (let i = 0; i < 60 && !(await q("return !!document.querySelector('.navtoggle');").catch(() => false)); i++) await sleep(250);
  await sleep(400);
  const open = await icons();
  await q("document.querySelector('.navtoggle').click();");
  // ระหว่างเลื่อน ไอคอนต้องไม่หด
  let worst = Infinity;
  for (let i = 0; i < 12; i++) { const now = await icons(); now.forEach((n, k) => { worst = Math.min(worst, n.w / open[k].w); }); await sleep(20); }
  await sleep(350);
  const mini = await icons();
  check("ตอนย่อ ไอคอนครบทุกตัว ขนาดเท่าตอนกาง รวมโลโก้", mini.length === open.length && mini.every((n, k) => n.w === open[k].w && n.h === open[k].h && n.w > 0), `โลโก้ ${open[0].w} → ${mini[0].w} จุด · ${mini.length} ไอคอน`);
  check("ระหว่างเลื่อน ไอคอนไม่หด", worst >= 0.99, Math.round(worst * 100) + "%");
  check("ตอนย่อ ไอคอนอยู่ในแถบ ไม่ตกขอบ", mini.every((n) => n.ในแถบ));
  const mid = await q("const s = document.querySelector('[data-navbar]').getBoundingClientRect(); const cx = (e) => { const r = document.querySelector(e).getBoundingClientRect(); return Math.round((r.left + r.width / 2 - (s.left + s.width / 2)) * 10) / 10; }; return { โลโก้: cx('.brand svg'), เมนู: cx('.nav svg') };");
  check("ตอนย่อ โลโก้กับไอคอนเมนูอยู่กลางแถบ", Math.abs(mid.โลโก้) <= 2 && Math.abs(mid.เมนู) <= 2, JSON.stringify(mid));
  const ver = () => q("const s = document.querySelector('[data-navbar]').getBoundingClientRect(), e = document.querySelector('[data-version]'), g = document.createRange(); g.selectNodeContents(e); const r = g.getBoundingClientRect(), t = document.querySelector('.navtoggle').getBoundingClientRect(); return { text: e.textContent, ในแถบ: r.left >= s.left && r.right <= s.right, ใต้ปุ่ม: r.top >= t.bottom - 1, ในจอ: r.bottom <= innerHeight, กลางห่าง: Math.round(Math.abs((r.left + r.width / 2) - (s.left + s.width / 2))) };");
  const vMini = await ver();
  check("ตอนย่อ เลขรุ่น v0.9.0 อยู่ใต้ปุ่ม กลางแถบ ไม่ตกขอบ", vMini.text === "v0.9.0" && vMini.ในแถบ && vMini.ใต้ปุ่ม && vMini.ในจอ && vMini.กลางห่าง <= 2, JSON.stringify(vMini));
  await c.shot(`${OUT}/03-ย่อ.png`);
  await q("document.querySelector('.navtoggle').click();");
  await sleep(450);
  const back = await icons();
  check("กางกลับ ไอคอนกลับที่เดิม", back.every((n, k) => n.w === open[k].w && Math.abs(n.x - open[k].x) < 0.6));
  const vOpen = await ver();
  check("ตอนกาง เลขรุ่นอยู่ใต้ปุ่ม", vOpen.text === "v0.9.0" && vOpen.ในแถบ && vOpen.ใต้ปุ่ม && vOpen.ในจอ, JSON.stringify(vOpen));
  await c.shot(`${OUT}/01-กาง.png`);
} finally {
  await inv("set_settings", { patch: { sidebarCollapsed: before.sidebarCollapsed } });
  await q("location.reload();").catch(() => null);
}
const pass = results.filter(Boolean).length;
console.log(`ผ่าน ${pass} ไม่ผ่าน ${results.length - pass}`);
c.close();
process.exit(results.every(Boolean) ? 0 : 1);
