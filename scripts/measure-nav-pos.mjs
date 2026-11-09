// วัดตำแหน่งของบนจอทีละเฟรมตอนกดย่อกับขยายเมนู · อาการกระตุกที่เวลาเฟรมจับไม่ได้ ไอคอนกระโดด ชั้นวางจัดแถวใหม่ทุกเฟรม
// ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/measure-nav-pos.mjs · คืนสถานะเมนูเดิมตอนจบ
import { connect, sleep } from "./lib/cdp-client.mjs";
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})});`);
const before = (await inv("get_settings")).settings;
const run = () => q(`const out = []; const sample = () => { const r = (e) => e ? e.getBoundingClientRect() : null; const icon = r(document.querySelector('.nav svg')), brand = r(document.querySelector('.brand svg')), side = r(document.querySelector('[data-navbar]')), main = r(document.querySelector('.main')), books = [...document.querySelectorAll('.book[data-movie]')], cover = books[0] && r(books[0].querySelector('.cover')); const firstTop = books[0] && r(books[0]).top; return { icon: icon && Math.round(icon.left * 10) / 10, brand: brand && Math.round(brand.left * 10) / 10, side: Math.round(side.width), main: Math.round(main.width), mainLeft: Math.round(main.left), cover: cover ? Math.round(cover.width * 10) / 10 : null, perRow: books.filter((b) => r(b).top === firstTop).length }; };
  let going = true; const tick = () => { out.push(sample()); if (going) requestAnimationFrame(tick); };
  await new Promise((r) => requestAnimationFrame(() => { tick(); r(); }));
  await new Promise((r) => setTimeout(r, 34));
  document.querySelector('.navtoggle').click();
  await new Promise((r) => setTimeout(r, 420));
  going = false;
  const jump = (k) => { let m = 0; for (let i = 1; i < out.length; i++) { const a = out[i - 1][k], b = out[i][k]; if (a != null && b != null) m = Math.max(m, Math.abs(b - a)); } return Math.round(m * 10) / 10; };
  const distinct = (k) => new Set(out.map((x) => x[k])).size;
  return { เฟรม: out.length, ไอคอนกระโดดมากสุด: jump('icon'), โลโก้กระโดดมากสุด: jump('brand'), แถบเมนูกว้างกี่ค่า: distinct('side'), เนื้อหากว้างกี่ค่า: distinct('main'), ปกกว้างกี่ค่า: distinct('cover'), ต่อแถวเปลี่ยนกี่ค่า: distinct('perRow'), ต่อแถว: [...new Set(out.map((x) => x.perRow))].join(' '), เริ่ม: out[0], จบ: out[out.length - 1] };`);
try {
  await inv("set_settings", { patch: { viewMode: "grid", sidebarCollapsed: false } });
  await q("location.reload();").catch(() => null);
  await sleep(2500);
  for (let i = 0; i < 60 && !(await q("return !!document.querySelector('.book[data-movie]');").catch(() => false)); i++) await sleep(250);
  await q("[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes('ชั้นวางหนัง')).click();");
  await sleep(800);
  console.log("ย่อ", JSON.stringify(await run()));
  await sleep(400);
  console.log("ขยาย", JSON.stringify(await run()));
} finally {
  await inv("set_settings", { patch: { viewMode: before.viewMode, sidebarCollapsed: before.sidebarCollapsed } });
  await q("location.reload();").catch(() => null);
}
c.close();
