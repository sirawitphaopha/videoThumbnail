// แถบใต้ปกแบบ ค ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-bname.mjs · คืนค่าตั้งเดิมตอนจบ ไม่แตะไฟล์หนัง
import { mkdirSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-09/แถบใต้ปก";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})});`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };

const before = (await inv("get_settings")).settings;
const setBoth = async (patch) => {
  await inv("set_settings", { patch });
  await q("location.reload();").catch(() => null);
  await sleep(2500);
  for (let i = 0; i < 60 && !(await q("return !!document.querySelector('.nav');").catch(() => false)); i++) await sleep(250);
  await q("[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes('ชั้นวางหนัง')).click();");
  for (let i = 0; i < 40 && !(await q("return !!document.querySelector('.book[data-movie]');").catch(() => false)); i++) await sleep(250);
  await sleep(500);
};
const layout = () => q(`const r = (e) => e ? e.getBoundingClientRect() : null;
  const books = [...document.querySelectorAll('.book[data-movie]')];
  const rows = {};
  for (const b of books) { const top = Math.round(r(b.querySelector('.cover')).top); (rows[top] ??= []).push(b); }
  const off = (b, s) => { const e = b.querySelector(s); return e ? Math.round((r(e).top - r(b).top) * 10) / 10 : null; };
  const vis = (t) => [...t.children].filter((x) => x.style.display !== 'none');
  const tags = books.map((b) => ({ n: b.dataset.movie, t: b.querySelector('.bn3') }));
  return { books: books.length, rows: Object.values(rows).map((list) => ({ n: list.length, l1: [...new Set(list.map((b) => off(b, '.bn1')))], l2: [...new Set(list.map((b) => off(b, '.bn2')))], l3: [...new Set(list.map((b) => off(b, '.bn3')))] })),
    twoLines: books.filter((b) => r(b.querySelector('.bn1')).height > 26).map((b) => b.dataset.movie),
    maxLines: Math.max(...tags.map((x) => new Set(vis(x.t).map((e) => Math.round(r(e).top))).size)),
    cut: tags.flatMap((x) => vis(x.t).filter((e) => r(e).right > r(x.t).right + 0.5).map((e) => x.n + ' ' + e.textContent)),
    nochan: tags.filter((x) => x.t.classList.contains('nochan')).map((x) => x.n),
    sample: tags.slice(0, 3).map((x) => x.n + ' → ' + vis(x.t).map((e) => e.textContent).join(' , ')),
    colors: (() => { const css = (s) => { const e = document.querySelector(s); return e ? getComputedStyle(e) : null; }; const f = css('.bn3 .bt.f'), a = css('.bn3 .bt.a'), s = css('.bn3 .bt.s'), v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return { ไฟล์: f?.backgroundColor, เสียง: a?.backgroundColor, ซับ: s?.backgroundColor, หนา: f?.fontWeight }; })(),
  };`);

try {
  for (const size of ["m", "s", "l"]) {
    await setBoth({ coverSize: size, showNames: true, showDots: true, viewMode: "grid" });
    const l = await layout();
    console.log(l.sample.join("\n"));
    const flat = l.rows.every((x) => x.l1.length === 1 && x.l2.length === 1 && x.l3.length === 1);
    check(`ปก ${size} ชื่อ เครื่องหมาย ป้าย ระดับเดียวกันทุกแถว`, flat && l.books > 0, JSON.stringify(l.rows[0]));
    check(`ปก ${size} ชื่อบรรทัดเดียว`, l.twoLines.length === 0, l.twoLines.join(", "));
    check(`ปก ${size} ป้ายสูงสุด 2 บรรทัด ไม่ล้นการ์ด`, l.maxLines <= 2 && l.cut.length === 0, `มากสุด ${l.maxLines} บรรทัด · ตัดแชนแนล ${l.nochan.length} เรื่อง ${l.nochan.join(", ")}`);
    if (size === "m") check("สีแบบ ค ไฟล์สีหลัก เสียงเขียว ซับเหลือง ตัวหนา", new Set([l.colors.ไฟล์, l.colors.เสียง, l.colors.ซับ]).size === 3 && l.colors.หนา === "700", JSON.stringify(l.colors));
    await c.shot(`${OUT}/ปก-${size}.png`, ".main");
  }
  // ยืนยันว่าตัดแชนแนลเฉพาะเรื่องที่ล้น · บีบหน้าต่างแล้วต้องนับใหม่
  await setBoth({ coverSize: "s", showNames: true, showDots: true, viewMode: "grid" });
  const small = await layout();
  check("ปกเล็ก เรื่องป้ายเยอะตัดแชนแนล เรื่องอื่นยังมีแชนแนล", small.nochan.length < small.books, `${small.nochan.length} จาก ${small.books} เรื่อง`);
  await setBoth({ coverSize: "m", showNames: false, showDots: true });
  const noNames = await q("return { text: [...document.querySelectorAll('.book .bname')].map((b) => b.innerText.trim()).join(''), dots: document.querySelectorAll('.book .bn2 .badge').length };");
  check("ปิดชื่อ ไม่มีตัวหนังสือใต้ปก เหลือเครื่องหมาย", noNames.text === "" && noNames.dots > 0, JSON.stringify(noNames));
  await setBoth({ coverSize: "m", showNames: true, showDots: false });
  const noDots = await q("return { badge: document.querySelectorAll('.book .bn2 .badge').length, stars: document.querySelectorAll('.book .bn2 .stars').length, tags: document.querySelectorAll('.book .bn3').length };");
  check("ปิดเครื่องหมาย ไม่มีเครื่องหมาย ดาวกับป้ายยังอยู่", noDots.badge === 0 && noDots.stars > 0 && noDots.tags > 0, JSON.stringify(noDots));
  /* ดาว · กดจริง คืนคะแนนเดิมตอนจบ */
  await setBoth({ coverSize: "s", showNames: true, showDots: true, viewMode: "grid" });
  const widest = await q("return [...document.querySelectorAll('.book')].filter((b) => { const n = b.querySelector('.bn2'), s = n?.querySelector('.stars'); return s && s.getBoundingClientRect().right > b.getBoundingClientRect().right + 0.5; }).length;");
  check("ปกเล็ก ดาวไม่ล้นการ์ด", widest === 0, widest);
  await setBoth({ coverSize: "m", showNames: true, showDots: true, viewMode: "grid" });
  const NAME = "Harbor Lights (2021)", sel = `.book[data-movie="${NAME}"]`;
  const mov = () => inv("get_library").then((r) => r.movies.find((m) => m.name === NAME));
  const oldRating = (await mov()).rating ?? 0;
  try {
    await inv("set_rating", { id: (await mov()).id, stars: 0 }); await sleep(250);
    await q(`document.querySelector('.dclose')?.click();`); await sleep(200);
    await q(`document.querySelector('${sel}').scrollIntoView({ block: 'center' });`); await sleep(200);
    await c.click(`${sel} [data-star="4"]`); await sleep(350);
    check("กดดาวดวงที่ 4 ได้ 4 ดาว เก็บลงคลัง", (await mov()).rating === 4 && (await q(`return document.querySelectorAll('${sel} .star.on').length;`)) === 4, (await mov()).rating);
    check("กดดาวแล้วไม่เลือกเรื่อง แผงขวาไม่เปิด", !(await q("return !!document.querySelector('.book.sel');")));
    await c.shot(`${OUT}/ดาว.png`, ".main");
    await c.hover(`${sel} [data-star="2"]`); await sleep(200);
    check("ชี้ดวงที่ 2 ดาวแสดงตามเมาส์ ค่าเดิมไม่เปลี่ยน", (await q(`return document.querySelectorAll('${sel} .star.on').length;`)) === 2 && (await mov()).rating === 4);
    await c.click(`${sel} [data-star="4"]`); await sleep(350);
    check("กดดวงเดิมซ้ำ ล้างคะแนน", (await mov()).rating === 0);
    await c.click(`${sel} [data-star="3"]`); await sleep(300);
    await q("location.reload();").catch(() => null); await sleep(2500);
    for (let i = 0; i < 60 && !(await q(`return !!document.querySelector('${sel}');`).catch(() => false)); i++) await sleep(250);
    check("โหลดหน้าใหม่ คะแนนยังอยู่", (await q(`return document.querySelector('${sel} .stars')?.dataset.stars;`)) === "3");
  } finally {
    await inv("set_rating", { id: (await mov()).id, stars: oldRating });
  }
} finally {
  await setBoth({ coverSize: before.coverSize, showNames: before.showNames, showDots: before.showDots, viewMode: before.viewMode });
}
const pass = results.filter(Boolean).length;
console.log(`ผ่าน ${pass} ไม่ผ่าน ${results.length - pass}`);
c.close();
process.exit(results.every(Boolean) ? 0 : 1);
