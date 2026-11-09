// ดาวในแผงขวา กรองดาว เรียงตามดาว ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-stars.mjs · คืนคะแนนกับค่าตั้งเดิมตอนจบ
import { mkdirSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";
const OUT = "docs/report-2026-11-09/แถบใต้ปก";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})});`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js).catch(() => false)) return true; await sleep(120); } return false; };
const before = (await inv("get_settings")).settings;
const lib0 = (await inv("get_library")).movies;
const oldRatings = lib0.map((m) => [m.id, m.rating ?? 0]);
const idOf = (n) => lib0.find((m) => m.name === n).id;
const reload = async (patch) => { await inv("set_settings", { patch }); await q("location.reload();").catch(() => null); await sleep(2500); await waitFor("return !!document.querySelector('.book[data-movie]');", 20000); await q("[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes('ชั้นวางหนัง')).click();"); await sleep(500); };
const books = () => q("return [...document.querySelectorAll('.book[data-movie]')].map((b) => b.dataset.movie);");
const pickStar = async (label) => { await q("document.querySelector('[data-star-filter] button').click();"); await sleep(150); await q(`[...document.querySelectorAll('[data-star-filter] button, [data-star-filter] [role="option"]')].filter((b) => b.innerText.trim() === ${JSON.stringify(label)}).pop().click();`); await sleep(250); };
const A = "ดาวเหนือ (2023)", B = "Harbor Lights (2021)", C = "Clip (2015)";
try {
  for (const [id] of oldRatings) await inv("set_rating", { id, stars: 0 });
  await inv("set_rating", { id: idOf(A), stars: 5 }); await inv("set_rating", { id: idOf(B), stars: 3 }); await inv("set_rating", { id: idOf(C), stars: 1 });
  await reload({ viewMode: "grid", sort: "name-asc", coverSize: "m", showNames: true, showDots: true });

  const all = await books();
  await pickStar("4 ดาวขึ้นไป");
  check("กรอง 4 ดาวขึ้นไป เหลือเรื่องที่ได้ 5 ดาว", JSON.stringify(await books()) === JSON.stringify([A]), (await books()).join(", "));
  check("แถบล่างบอกจำนวนที่เจอ", (await q("return document.querySelector('[data-statusbar]').innerText;")).includes("เจอ 1 จาก"));
  await c.shot(`${OUT}/กรองดาว.png`, ".main");
  await pickStar("1 ดาวขึ้นไป");
  check("กรอง 1 ดาวขึ้นไป เหลือ 3 เรื่อง", (await books()).length === 3, (await books()).join(", "));
  check("เลขปุ่มกรองปกตรงกับที่กรองดาว", (await q(`return document.querySelector('[data-shelf-tab="all"]').innerText;`)).includes("3"));
  await pickStar("ยังไม่ให้ดาว");
  check("กรองยังไม่ให้ดาว ไม่เหลือเรื่องที่มีดาว", !(await books()).some((n) => [A, B, C].includes(n)) && (await books()).length === all.length - 3);
  await inv("set_rating", { id: idOf(A), stars: 0 });
  await sleep(300);
  await pickStar("5 ดาว");
  check("กรองแล้วไม่มีเรื่อง ขึ้นข้อความพร้อมปุ่มดูทุกดาว", await q("return !!document.querySelector('[data-star-empty]');"));
  await q("document.querySelector('[data-star-empty] button').click();"); await sleep(250);
  check("กดดูทุกดาว กลับมาครบ", (await books()).length === all.length);
  await inv("set_rating", { id: idOf(A), stars: 5 });

  await reload({ viewMode: "grid", sort: "rating" });
  check("เรียงตามดาว มากไปน้อย", JSON.stringify((await books()).slice(0, 3)) === JSON.stringify([A, B, C]), (await books()).slice(0, 4).join(", "));
  check("รายการเรียงบอกว่าเรียงตามดาว", (await q("return document.querySelector('.topbar').innerText;")).includes("ดาวมากไปน้อย"));
  await q(`document.querySelector('.book[data-movie="${B}"]').scrollIntoView({ block: 'center' });`); await sleep(200);
  await c.book(B);
  await waitFor("return !!document.querySelector('.fstars .stars');");
  check("แผงขวามีดาว ตรงกับบนชั้น", (await q("return document.querySelector('.fstars .stars').dataset.stars;")) === "3");
  await c.click('.fstars [data-star="4"]'); await sleep(350);
  const after = await inv("get_library").then((r) => r.movies.find((m) => m.name === B).rating);
  check("กดดาวในแผงขวา เก็บลงคลัง บนชั้นเปลี่ยนตาม แผงยังเปิด", after === 4 && (await q(`return document.querySelector('.book[data-movie="${B}"] .stars').dataset.stars;`)) === "4" && (await q("return !!document.querySelector('.detail');")), after);
  check("ดาวในแผงขวาใหญ่กว่าบนชั้น ไม่ล้นแผง", await q("const d = document.querySelector('.detail').getBoundingClientRect(), s = document.querySelector('.fstars .stars').getBoundingClientRect(), a = document.querySelector('.fstars .star svg').getBoundingClientRect(), b = document.querySelector('.book .stars .star svg').getBoundingClientRect(); return a.width > b.width && s.right <= d.right;"));
  await q("document.querySelector('.detail').scrollTop = 0;"); await sleep(150);
  await c.shot(`${OUT}/ดาวแผงขวา.png`, ".detail");
  await q("document.querySelector('.dclose')?.click();"); await sleep(150);

  /* ดาวใต้ชื่อในตาราง */
  await reload({ viewMode: "table", sort: "rating", coverSize: "s" });
  await waitFor("return !!document.querySelector('[data-table] tbody tr');");
  await sleep(300);
  const rowOf = (n) => `[...document.querySelectorAll('[data-table] tbody tr')].find((r) => r.children[1].innerText.includes(${JSON.stringify(n)}))`;
  const tb = await q(`const rows = [...document.querySelectorAll('[data-table] tbody tr')]; const r0 = rows[0], name = r0.children[1], st = name.querySelector('.stars'), r = (e) => e.getBoundingClientRect(); const g = document.createRange(); g.selectNodeContents(name.firstChild); return { ครบ: rows.every((x) => x.children[1].querySelector('.stars')), ชื่อยังมีนามสกุล: name.innerText.includes('.'), ดาวใต้ชื่อ: r(st).top >= g.getBoundingClientRect().bottom - 3, ซ้ายตรงชื่อ: Math.abs(r(st).left - g.getBoundingClientRect().left) <= 2, แถวสูง: Math.round(r(r0).height), ในช่อง: r(st).right <= r(name).right };`);
  check("ตาราง ทุกแถวมีดาวใต้ชื่อ แนวตรงกับชื่อ ไม่ล้นช่อง", tb.ครบ && tb.ชื่อยังมีนามสกุล && tb.ดาวใต้ชื่อ && tb.ซ้ายตรงชื่อ && tb.ในช่อง, JSON.stringify(tb));
  await q(`${rowOf(C)}.scrollIntoView({ block: 'center' }); ${rowOf(C)}.querySelector('[data-star="2"]').click();`); await sleep(350);
  const cAfter = await inv("get_library").then((r) => r.movies.find((m) => m.name === C).rating);
  check("ตาราง กดดาวได้ เก็บลงคลัง ไม่เลือกแถว", cAfter === 2 && !(await q("return !!document.querySelector('.detail');")), cAfter);
  await q("document.querySelector('.shelfwrap').scrollTop = 0;"); await sleep(150);
  await c.shot(`docs/report-2026-11-09/ตารางชั้นวาง/ดาวใต้ชื่อ.png`, ".main");
  await reload({ viewMode: "grid", sort: "rating" });

  await c.send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 640, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  const narrow = await q("const r = (e) => e.getBoundingClientRect(); const t = document.querySelector('.tbleft'), p = t.querySelector('.path'), s = t.querySelector('.tbstar'), n = document.querySelector('.topbar .search'); return { ทับ: r(s).right > r(n).left, ช่องโฟลเดอร์กว้าง: Math.round(r(p).width), ดาวล้น: s.querySelector('button').scrollWidth > s.querySelector('button').clientWidth, เรียงโดนตัด: (() => { const d = [...document.querySelectorAll('.topbar button.dd, .topbar .dd')].find((e) => e.innerText.includes('ดาวมากไปน้อย')); if (!d) return true; const cs = getComputedStyle(d), x = document.createElement('canvas').getContext('2d'); x.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; return x.measureText('เรียงตามดาวมากไปน้อย').width + parseFloat(cs.paddingLeft) + 22 > d.getBoundingClientRect().width; })(), ไอคอนโฟลเดอร์: Math.round(p.querySelector('svg').getBoundingClientRect().width) };");
  check("หน้าต่าง 1024 ตัวกรองดาวไม่ทับช่องค้นหา ไม่ล้น", !narrow.ทับ && !narrow.ดาวล้น && !narrow.เรียงโดนตัด && narrow.ไอคอนโฟลเดอร์ === 18 && narrow.ช่องโฟลเดอร์กว้าง > 60, JSON.stringify(narrow));
  await c.shot(`${OUT}/แถบบน-1024.png`, ".topbar");
  await c.send("Emulation.clearDeviceMetricsOverride", {});
} finally {
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => null);
  for (const [id, stars] of oldRatings) await inv("set_rating", { id, stars }).catch(() => null);
  await inv("set_settings", { patch: { viewMode: before.viewMode, sort: before.sort, coverSize: before.coverSize, showNames: before.showNames, showDots: before.showDots } });
  await q("location.reload();").catch(() => null);
}
const pass = results.filter(Boolean).length;
console.log(`ผ่าน ${pass} ไม่ผ่าน ${results.length - pass}`);
c.close();
process.exit(results.every(Boolean) ? 0 : 1);
