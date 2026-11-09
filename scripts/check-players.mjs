// หน้าตั้งค่า การ์ดเปิดเล่นหนัง ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-players.mjs
// ไม่กดปุ่มเปิดเล่น เพราะโปรแกรมเล่นจะเด้งขึ้นจอ · ไม่กดปุ่มเพิ่มโปรแกรม เพราะกล่องเลือกไฟล์จะเด้ง ตั้งรายการผ่าน set_settings แทน · คืนค่าตั้งเดิมตอนจบ
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-09/โปรแกรมเล่น";
mkdirSync(OUT, { recursive: true });
const FAKE_DIR = "D:\\dev\\tmp\\โปรแกรมเล่นทดสอบ";
const FAKE = FAKE_DIR + "\\my player.exe";
const GONE = "D:\\ไม่มีโปรแกรมนี้\\gone.exe";
mkdirSync(FAKE_DIR, { recursive: true });
writeFileSync(FAKE, "");

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})});`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const row = (p) => `document.querySelector('[data-player="' + ${JSON.stringify(p)}.replace(/\\\\/g, '\\\\\\\\') + '"]')`;
const defaults = () => q("return [...document.querySelectorAll('[data-player-default]')].map((r) => r.querySelector('b').innerText);");
const setSettings = async (patch) => { await inv("set_settings", { patch }); await q("location.reload();").catch(() => null); await sleep(2500); await waitFor("return !!document.querySelector('.nav');", 30000); await q("[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes('ตั้งค่า')).click();"); await sleep(400); await c.setNav("player"); await waitFor("return !!document.querySelector('[data-player=\"system\"]');"); };

const before = (await inv("get_settings")).settings;
try {
  await setSettings({ playerPath: "", players: [] });
  const list = await inv("list_players");
  console.log("หาเจอในเครื่อง · " + list.players.map((p) => `${p.name} ${p.path}`).join(" | "));
  const mpc = list.players.find((p) => p.name === "MPC-HC");
  check("เครื่องนี้หาเจอ MPC-HC", !!mpc, mpc?.path);
  check("ยังไม่ได้เลือก ค่าตั้งต้นคือ MPC-HC ตัวเดียว", JSON.stringify(await defaults()) === '["MPC-HC"]', JSON.stringify(await defaults()));
  check("มีปุ่มเพิ่มโปรแกรม (ไม่กด กล่องเลือกไฟล์จะเด้ง)", await q("return !!document.querySelector('[data-player-add]');"));
  const icon = await q(`const i = ${row(mpc.path)}.querySelector('img.plicon'); return i ? { w: i.naturalWidth, h: i.naturalHeight, done: i.complete, box: Math.round(i.getBoundingClientRect().width) } : null;`);
  check("แถว MPC-HC ใช้ไอคอนจริงของโปรแกรม รูปขึ้นจริง", icon?.done && icon.w > 0 && icon.box === 24, JSON.stringify(icon));
  const mid = await q(`const b = document.querySelector('.plrow .pldef'); const g = document.createRange(); g.selectNodeContents([...b.childNodes].find((n) => n.nodeType === 3)); const x = b.getBoundingClientRect(), t = g.getBoundingClientRect(), s = b.querySelector('svg').getBoundingClientRect(); return { ต่าง: Math.abs((x.left + x.width / 2) - (t.left + t.width / 2)), ถูกห่างคำ: t.left - s.right };`);
  check("คำว่าค่าตั้งต้นอยู่กลางป้าย เครื่องหมายถูกไม่ทับคำ", mid.ต่าง < 1 && mid.ถูกห่างคำ > 0, JSON.stringify(mid));
  await c.shot(`${OUT}/01-ค่าตั้งต้น-MPC-HC.png`, '[data-setcard="player"]');

  await c.click('[data-player="system"] [data-player-set]');
  check("กดตั้งโปรแกรมหลักของ Windows ป้ายย้ายมาแถวนี้", await waitFor(`return document.querySelector('[data-player="system"]')?.hasAttribute('data-player-default') && !document.querySelector('[data-player-default]:not([data-player="system"])');`));
  check("เก็บค่าเป็น system", (await inv("get_settings")).settings.playerPath === "system");
  await c.shot(`${OUT}/02-เลือกโปรแกรมหลัก.png`, '[data-setcard="player"]');

  await setSettings({ playerPath: "", players: [FAKE, GONE] });
  const added = await q(`const r = ${row(FAKE)}; return r ? { t: r.innerText, x: !!r.querySelector('[data-player-remove]'), set: !!r.querySelector('[data-player-set]') } : null;`);
  check("โปรแกรมที่เพิ่มเองขึ้นในรายการ มีปุ่มตั้งค่าตั้งต้นกับปุ่มเอาออก", added?.t.includes("my player") && added.x && added.set, JSON.stringify(added));
  const noIcon = await q(`const r = ${row(FAKE)}; return { img: !!r.querySelector('img.plicon'), svg: !!r.querySelector(':scope > svg') };`);
  check("ไฟล์ที่ไม่มีไอคอนใช้ไอคอนกลาง", !noIcon.img && noIcon.svg, JSON.stringify(noIcon));
  const gone = await q(`const r = ${row(GONE)}; return r ? { t: r.innerText, wait: r.querySelector('[data-player-set]')?.getAttribute('aria-disabled') } : null;`);
  check("โปรแกรมที่หาไม่เจอบอกชัด ตั้งเป็นค่าตั้งต้นไม่ได้", gone?.t.includes("หาไฟล์ไม่เจอ") && gone.wait === "true", JSON.stringify(gone));
  const noX = await q("return [...document.querySelectorAll('[data-player]:not([data-player=\"system\"])')].filter((r) => !r.querySelector('[data-player-remove]')).length;");
  check("ตัวที่หาเจอในเครื่องเอาออกจากรายการไม่ได้", noX === list.players.length, noX);
  await c.shot(`${OUT}/03-เพิ่มเอง-และหาไม่เจอ.png`, '[data-setcard="player"]');

  await c.click(`[data-player="${FAKE.replace(/\\/g, "\\\\")}"] [data-player-set]`);
  check("กดตั้งโปรแกรมที่เพิ่มเอง ป้ายย้ายมาแถวนี้", await waitFor(`return ${row(FAKE)}?.hasAttribute('data-player-default');`));
  check("เก็บที่อยู่โปรแกรม", (await inv("get_settings")).settings.playerPath === FAKE);
  const widths = await q("return [...document.querySelectorAll('.plrow .plset, .plrow .pldef')].map((e) => Math.round(e.getBoundingClientRect().width));");
  check("ปุ่มกับป้ายกว้างเท่ากันทุกแถว", new Set(widths).size === 1, widths.join(" "));
  const over = await q("const c = document.querySelector('[data-setcard=\"player\"]'); return c.scrollWidth > c.clientWidth;");
  check("การ์ดไม่ล้นแนวนอน", !over);

  await c.click(`[data-player="${FAKE.replace(/\\/g, "\\\\")}"] [data-player-remove]`);
  check("เอาค่าตั้งต้นออกจากรายการ กลับไปใช้ MPC-HC", await waitFor(`return !${row(FAKE)} && document.querySelector('[data-player-default] b')?.innerText === 'MPC-HC';`));
  const now = (await inv("get_settings")).settings;
  check("ค่าตั้งล้างถูก ไฟล์โปรแกรมไม่ถูกลบ", now.playerPath === "" && !now.players.includes(FAKE) && now.players.includes(GONE));

  // เครื่องไม่มี MPC-HC ทดสอบใน cargo test (players.rs check ไม่ได้ลบโปรแกรมจริง)
} finally {
  await inv("set_settings", { patch: { playerPath: before.playerPath, players: before.players ?? [] } });
  rmSync(FAKE_DIR, { recursive: true, force: true });
}
const pass = results.filter(Boolean).length;
console.log(`ผ่าน ${pass} ไม่ผ่าน ${results.length - pass}`);
c.close();
process.exit(results.every(Boolean) ? 0 : 1);
