// วัดเฟรมตอนกดย่อกับขยายแถบเมนู · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/measure-nav.mjs [จำนวนรอบ] · คืนสถานะเมนูเดิมตอนจบ
// ดูช่วงห่างเฟรม 16.7 = ลื่น · 33 ขึ้นไป = หลุดเฟรม (สกิล sidebar-slide ข้อ 5) · หน้าต่างถูกบังจอ เบราว์เซอร์อาจชะลอเฟรม ตัวเลขใช้เทียบก่อนหลังเท่านั้น
import { connect, sleep } from "./lib/cdp-client.mjs";
const ROUNDS = Number(process.argv[2] ?? 4);
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})});`);
const before = (await inv("get_settings")).settings;
const run = () => q(`const gaps = [], longs = []; let last = performance.now(), going = true;
  const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) longs.push(Math.round(e.duration)); }); try { po.observe({ entryTypes: ['longtask'] }); } catch {}
  const tick = (t) => { gaps.push(t - last); last = t; if (going) requestAnimationFrame(tick); };
  await new Promise((r) => requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); r(); }));
  const t0 = performance.now();
  document.querySelector('.navtoggle').click();
  let flip = null; const side = document.querySelector('[data-navbar]'), had = side.classList.contains('mini-nav');
  while (performance.now() - t0 < 420) { if (flip == null && side.classList.contains('mini-nav') !== had) flip = Math.round(performance.now() - t0); await new Promise((r) => setTimeout(r, 4)); }
  going = false; po.disconnect();
  const g = gaps.slice(1).map((x) => Math.round(x * 10) / 10);
  return { เฟรม: g.length, ยาวสุด: Math.max(...g), หลุด: g.filter((x) => x > 25).length, สลับคลาส: flip, งานยาว: longs };`);
const summary = (name, list) => { const worst = Math.max(...list.map((r) => r.ยาวสุด)), drop = list.reduce((n, r) => n + r.หลุด, 0), frames = list.reduce((n, r) => n + r.เฟรม, 0), lt = list.flatMap((r) => r.งานยาว); console.log(`${name} · เฟรมรวม ${frames} · ยาวสุด ${worst} ms · หลุด ${drop} เฟรม · งานยาว ${lt.join(" ") || "ไม่มี"} · สลับคลาสหลังกด ${list.map((r) => r.สลับคลาส).join(" ")} ms`); };
try {
  for (const view of ["grid", "table"]) {
    await inv("set_settings", { patch: { viewMode: view, sidebarCollapsed: false } });
    await q("location.reload();").catch(() => null);
    await sleep(2500);
    for (let i = 0; i < 60 && !(await q("return !!document.querySelector('.book[data-movie], [data-table] tbody tr');").catch(() => false)); i++) await sleep(250);
    await q("[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes('ชั้นวางหนัง')).click();");
    await sleep(800);
    const out = [];
    for (let i = 0; i < ROUNDS; i++) { out.push(await run()); await sleep(300); }
    summary(view === "grid" ? "ชั้นวางภาพปก" : "ชั้นวางตาราง", out);
    console.log(`  จำนวน ${await q("return { เรื่อง: document.querySelectorAll('.book[data-movie], [data-table] tbody tr').length, ชิ้น: document.querySelectorAll('*').length };").then(JSON.stringify)}`);
  }
  for (const [label, nav] of [["หน้าตั้งค่า", "ตั้งค่า"], ["หน้าเสียงและซับ", "เสียงและซับ"]]) {
    await q(`[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes('${nav}')).click();`);
    await sleep(800);
    const out = [];
    for (let i = 0; i < ROUNDS; i++) { out.push(await run()); await sleep(300); }
    summary(label, out);
  }
} finally {
  await inv("set_settings", { patch: { viewMode: before.viewMode, sidebarCollapsed: before.sidebarCollapsed } });
  await q("location.reload();").catch(() => null);
}
c.close();
