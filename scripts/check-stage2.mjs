// เทสขั้น 2 ชั้นวาง ในหน้าต่างโปรแกรมจริง ผ่านพอร์ตดีบัก (แผนขั้น 2 ตารางตรวจผล)
// ชี้โฟลเดอร์ทดสอบแล้วขึ้นชั้นครบ จำนวนตรง · ปกบนชั้นโหลดได้ · ไฟล์เดิม แยกไฟล์ ไม่ขึ้นชั้น · ค้นด้วยคำพิมพ์ผิดแป้นเจอ
// เรียง 6 แบบลำดับถูก · โฟลเดอร์หายขึ้นจาง · หนัง 500 เรื่องเปิดชั้นไม่ค้าง · ถ่ายภาพทุกสถานะ
// ใช้: node scripts/make-shelf-test.mjs (ครั้งแรก) แล้ว node scripts/check-stage2.mjs [โฟลเดอร์ทดสอบ]
import { mkdirSync, writeFileSync, readdirSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const BASE = process.argv[2] ?? "D:\\dev\\tmp\\ชั้นทดสอบ";
const MOVIES = join(BASE, "หนัง");
const MANY = join(BASE, "500เรื่อง");
const OUT = "docs/report-2026-11-06/ขั้น2";
const ACCEPTED = ["mkv", "mp4", "m4v", "mov", "avi", "webm", "ts", "m2ts", "mpg", "mpeg", "vob", "flv"];
mkdirSync(OUT, { recursive: true });
if (!existsSync(MOVIES)) { console.log(`ไม่มี ${MOVIES} · รัน node scripts/make-shelf-test.mjs ก่อน`); process.exit(1); }

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
async function waitScan(maxMs = 120000) {
  const t0 = Date.now();
  await sleep(300);
  while (Date.now() - t0 < maxMs) {
    const r = await inv("get_library");
    const ui = await q("return !!document.querySelector('.btn-wait') && document.querySelector('.topbar .btn-wait')?.innerText.includes('กำลังอ่าน')");
    if (!r.scanning && !ui) return { ms: Date.now() - t0, lib: r };
    await sleep(200);
  }
  throw new Error("รออ่านโฟลเดอร์เกินเวลา");
}
const names = () => q("return [...document.querySelectorAll('.book[data-movie]')].map(b => b.dataset.movie)");
// เลื่อนเมาส์ไปที่ว่างในเมนูซ้ายก่อนถ่าย ไม่ให้ปกที่เมาส์ค้างอยู่ลอยขึ้นในภาพ
const shot = async (f, sel, pad) => { await c.move(100, 600); await sleep(250); return c.shot(`${OUT}/${f}`, sel, pad); };

// ไฟล์ที่ต้องขึ้นชั้น นับจากโฟลเดอร์จริง ข้ามไฟล์เดิม กับ แยกไฟล์
function expected(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (e.name === "ไฟล์เดิม" || e.name.endsWith(" แยกไฟล์")) continue; out.push(...expected(join(dir, e.name))); }
    else { const m = e.name.match(/^(.*)\.([^.]+)$/); if (m && ACCEPTED.includes(m[2].toLowerCase())) out.push(m[1]); }
  }
  return out;
}

// ---------- ล้างคลังก่อน (เอาทุกโฟลเดอร์ออกแล้วอ่าน) ให้เหมือนเปิดครั้งแรก ----------
await inv("set_settings", { patch: { folders: [] } });
await inv("scan_library"); await waitScan();
// ยังไม่มีโฟลเดอร์ = ชั้นว่าง ไม่มีเมนู (สเปกข้อ 10)
await c.evaluate("location.hash = ''; location.reload()"); await sleep(900);
const first = await q("return { title: document.querySelector('.firstrun-card')?.innerText ?? '', nav: !!document.querySelector('[data-navbar]'), toast: document.querySelectorAll('.toast').length }");
await shot("01-ชั้นว่าง.png");
check("ยังไม่เลือกโฟลเดอร์ ขึ้นชั้นว่างพร้อมปุ่มเลือกโฟลเดอร์ ไม่มีเมนูซ้าย", first.title.includes("ชั้นยังว่างอยู่") && first.title.includes("เลือกโฟลเดอร์หนัง") && !first.nav, `เมนูซ้าย ${first.nav ? "มี" : "ไม่มี"} · แถบแจ้งผล ${first.toast}`);
// ---------- ตั้งโฟลเดอร์ แล้วเปิดหน้าใหม่ ต้องอ่านโฟลเดอร์เองตอนเปิด ----------
await inv("set_settings", { patch: { folders: [MOVIES], viewMode: "grid", coverSize: "m", showNames: true, showDots: true, sort: "name-asc", sidebarCollapsed: false } });
await c.evaluate("location.hash = ''; location.reload()");
// รอจังหวะที่มีหนังขึ้นชั้นแล้วบางเรื่อง (เปิดโปรแกรมใหม่ ๆ หน้าโหลดช้ากว่าปกติ รอเวลาตายตัวพลาดได้)
for (let i = 0; i < 400; i++) {
  if (await q("return (document.querySelector('.shelfwrap .hint')?.innerText ?? '').includes('อ่านแล้ว') && document.querySelectorAll('.book[data-movie]').length > 0").catch(() => false)) break;
  await sleep(15);
}
await c.shot(`${OUT}/02-กำลังอ่าน.png`); // ถ่ายทันที อ่านโฟลเดอร์เสร็จในไม่ถึงวินาที
// วัดพร้อมกันในคำสั่งเดียว จำนวนปกกับคำบอกต้องมาจากจังหวะเดียวกัน
const mid = await q("return { skel: document.querySelectorAll('.skel').length, hint: document.querySelector('.shelfwrap .hint')?.innerText ?? '', books: document.querySelectorAll('.book[data-movie]').length }");
const { skel, hint } = mid;
check("เปิดโปรแกรมแล้วอ่านโฟลเดอร์เอง ขึ้นโครงจางต่อท้ายชั้นกับคำบอกว่ากำลังอ่าน", skel > 0 && hint.startsWith("กำลังอ่าน"), `โครงจาง ${skel} ชิ้น · "${hint}"`);
const midDone = Number((hint.match(/อ่านแล้ว (\d+) จาก/) ?? [])[1]);
check("คำบอกอ่านแล้วกี่เรื่อง ตรงกับจำนวนปกที่ขึ้นชั้นตอนนั้น", midDone === mid.books, `คำบอก ${midDone} · ปกบนชั้น ${mid.books}`);
const s1 = await waitScan();
const want = expected(MOVIES).sort();
const got = (await names()).sort();
check("ขึ้นชั้นครบทุกไฟล์ จำนวนตรง", got.length === want.length && got.every((n, i) => n === want[i]), `ชั้น ${got.length} เรื่อง · ในโฟลเดอร์ ${want.length} เรื่อง · อ่าน ${s1.ms} มิลลิวินาที`);
check("ไฟล์ในโฟลเดอร์ ไฟล์เดิม กับ แยกไฟล์ ไม่ขึ้นชั้น", !s1.lib.movies.some((m) => m.path.includes("\\ไฟล์เดิม\\") || m.path.includes(" แยกไฟล์\\")));
check("ไฟล์ในโฟลเดอร์ย่อยลึกสองชั้นขึ้นชั้น", got.includes("ตอนที่ 1 (2015)"));
await shot("03-ชั้นวาง.png");

// ปกบนชั้น
const cover = await q(`const b = document.querySelector('.book[data-movie="Harbor Lights (2021)"] img'); return b ? { ok: b.complete && b.naturalWidth > 0, w: b.naturalWidth, h: b.naturalHeight, src: b.src.slice(0, 40) } : null`);
check("ปกของเรื่องที่มีปกโหลดขึ้นชั้นได้ ภาพเล็ก 300 × 450", cover?.ok && cover.w === 300 && cover.h === 450, JSON.stringify(cover));
const harbor = s1.lib.movies.find((m) => m.name === "Harbor Lights (2021)");
check("คลังจดค่า hash ของปกในไฟล์ไว้ (เทียบกับ mkvextract แล้วในเทส Rust)", !!harbor?.coverSha256 && harbor.coverName === "cover.jpg", harbor?.coverSha256?.slice(0, 16));
const noCover = await q(`return document.querySelectorAll('.cover.none').length`);
check("เรื่องที่ไม่มีปกขึ้นกรอบประ ยังไม่มีโปสเตอร์", noCover === got.length - 1, `${noCover} เรื่อง`);

// เมนูซ้าย · หาเมนูตรวจไฟล์จากชื่อ (เดิมหยิบเมนูที่ 3 ตั้งแต่มีเมนูเสียงและซับแทรก เมนูที่ 3 ไม่ใช่ตรวจไฟล์แล้ว)
const side = await q("return { shelf: document.querySelector('.nav[aria-current=page] .count')?.innerText, check: [...document.querySelectorAll('.nav')].find(n => n.innerText.includes('ตรวจไฟล์'))?.querySelector('.count')?.innerText, foot: document.querySelector('.side .foot')?.innerText.replace(/\\n/g, ' / ') }");
const mkv = s1.lib.movies.filter((m) => m.ext === "mkv").length;
check("เมนูซ้ายนับหนังบนชั้น นับเรื่องที่ควรตรวจ และบอกพื้นที่รวม", side.shelf === String(got.length) && side.check === String(mkv) && /โฟลเดอร์หนัง 1 โฟลเดอร์/.test(side.foot), JSON.stringify(side));

// ชี้ปกแล้วลอย · กดแล้วเลือก
const book = await c.hover('.book[data-movie="Harbor Lights (2021)"]'); await sleep(350);
const lift = await q(`return getComputedStyle(document.querySelector('.book[data-movie="Harbor Lights (2021)"] .cover')).translate`);
check("ชี้ปกแล้วปกลอยขึ้น 3", lift === "0px -3px", lift);
await c.book("Harbor Lights (2021)"); await sleep(250);
const det = await q("return { nm: document.querySelector('.detail .nm')?.innerText, sel: document.querySelector('.book.sel')?.dataset.movie, card: document.querySelector('.detail .stat b')?.innerText, poster: document.querySelector('.detail img.dposter')?.naturalWidth }");
check("กดปกแล้วแผงขวาขึ้นเรื่องนั้น โปสเตอร์ใหญ่โหลดได้ การ์ดยังไม่เคยตรวจ", det.nm === "Harbor Lights (2021).mkv" && det.sel === "Harbor Lights (2021)" && det.card === "ยังไม่เคยตรวจไฟล์นี้" && det.poster > 0, JSON.stringify(det));
await shot("04-แผงรายละเอียด.png", ".detail", 0);
await c.book("The Last Orchard (2022)"); await sleep(250);
const info = await q("return document.querySelector('.detail .stat')?.innerText.replace(/\\n/g, ' / ')");
check("ไฟล์ MP4 ขึ้นการ์ด ยังไม่ได้ครอบเป็น MKV พร้อมปุ่มครอบ", info.startsWith("ยังไม่ได้ครอบเป็น MKV") && (await q("return document.querySelector('.detail .minirow .btn-main')?.innerText")) === "ครอบเป็น MKV พร้อมโปสเตอร์", info);
await shot("05-การ์ดไม่ใช่MKV.png", ".detail", 0);
const kv = await q("return [...document.querySelectorAll('.detail .kv dd')].map(d => d.innerText).join(' | ')");
check("แผงรายละเอียดบอกขนาด ความยาว ภาพ เสียง ซับ", /KB|MB/.test(kv) && kv.includes("20 วินาที") && kv.includes("H.264") && kv.includes("AAC"), kv);

// ขนาดปก
for (const [label, size, w] of [["เล็ก", "s", 100], ["ใหญ่", "l", 180], ["กลาง", "m", 140]]) {
  await c.evaluate(`[...document.querySelectorAll('[aria-label="ขนาดปก"] button')].find(b => b.innerText === ${JSON.stringify(label)}).click()`);
  await sleep(300);
  const r = await q("const c = document.querySelector('.book .cover'); const row = document.querySelector('.shelf'); return { w: Math.round(c.getBoundingClientRect().width), per: row.querySelectorAll('.book').length }");
  const saved = (await inv("get_settings")).settings.coverSize;
  check(`ขนาดปก${label} ปกกว้าง ${w} จำค่าไว้`, r.w >= w && r.w <= w * 1.35 && saved === size, `กว้าง ${r.w} · แถวละ ${r.per} เรื่อง · บันทึก ${saved}`);
  if (size !== "m") await shot(`06-ปก${label}.png`, ".shelfwrap", 0);
}

// การแสดงผล
await c.click(".shelfhead [aria-haspopup=true]"); await sleep(250);
{ // ถ่ายหัวชั้นกับกล่องที่กางลงมาทั้งกล่อง (เดิมถ่ายแค่หัวชั้น กล่องโดนตัดครึ่ง)
  await c.move(100, 600); await sleep(250);
  const h = await c.box(".shelfhead"), m = await c.box('[role=dialog][aria-label="การแสดงผล"]');
  await c.shotRect(`${OUT}/07-กล่องการแสดงผล.png`, h.left - 12, h.top - 12, h.right - h.left + 24, m.bottom - h.top + 24);
}
await c.click('[role=dialog][aria-label="การแสดงผล"] .setrow:first-child .switch'); await sleep(200);
const noNames = await q("return [...document.querySelectorAll('.book .bname')].every(b => !b.innerText.trim())");
// ปิดชื่อแล้ว ชี้ปกต้องขึ้นชื่อ (ชื่อเต็มพร้อมนามสกุลที่ไม่ใช่ mkv ไม่มีบรรทัดว่างต่อท้าย)
const tips = await q("return [...document.querySelectorAll('.book[data-movie]')].map(b => b.title)");
const tipOk = tips.length === got.length && tips.every((t) => t && !t.endsWith("\n")) && tips.includes("The Last Orchard (2022).mp4");
await c.click('[role=dialog][aria-label="การแสดงผล"] .setrow:last-child .switch'); await sleep(200);
const noDots = await q("return document.querySelectorAll('.book .badge').length === 0");
await shot("08-ปิดชื่อและจุดสี.png", ".shelfwrap", 0);
check("ปิดชื่อไฟล์ใต้ปก ปิดจุดสี ชั้นเปลี่ยนทันที · ปิดชื่อแล้วชี้ปกขึ้นชื่อ", noNames && noDots && tipOk, `ชื่อตอนชี้ ${tips.filter(Boolean).length} เรื่อง เช่น ${JSON.stringify(tips[0])}`);
await c.click('[role=dialog][aria-label="การแสดงผล"] .setrow:first-child .switch');
await c.click('[role=dialog][aria-label="การแสดงผล"] .setrow:last-child .switch'); await sleep(150);
await c.key("Escape"); await sleep(150);
check("Esc ปิดกล่องการแสดงผล", !(await q("return !!document.querySelector('[role=dialog][aria-label=\"การแสดงผล\"]')")));

// ตาราง
await c.evaluate(`[...document.querySelectorAll('[aria-label="มุมมอง"] button')].find(b => b.innerText.includes('ตาราง')).click()`); await sleep(300);
const rows = await q("return document.querySelectorAll('.lv tbody tr').length");
const segOff = await q("return !!document.querySelector('.seg-off')");
await c.evaluate("[...document.querySelectorAll('.thsort')].find(b => b.innerText.startsWith('ขนาด')).click()"); await sleep(200);
const sizes = await q("return [...document.querySelectorAll('.lv tbody tr td:nth-child(3)')].map(t => t.innerText)");
const lib1 = Object.fromEntries((await inv("get_library")).movies.map((m) => [m.name + "." + m.ext, m]));
const tblNames = await q("return [...document.querySelectorAll('.lv tbody tr td:nth-child(2)')].map(t => t.innerText)");
const tblSizes = tblNames.map((n) => lib1[n].size);
const sizeOk = tblSizes.every((s, i) => i === 0 || tblSizes[i - 1] >= s);
const arrow = await q("return !!document.querySelector('th[aria-sort=descending] svg')");
// พี่กันสั่ง 9 พ.ย. 2569 "ตารางก็ปรับขนาดโปสเตอร์ได้นะ" ปุ่มขนาดปกจึงต้องกดได้ในตาราง
check("ตารางขึ้นครบ ปุ่มขนาดปกกดได้ กดหัวคอลัมน์ขนาดแล้วเรียงใหญ่ไปเล็ก มีลูกศรบอก", rows === got.length && !segOff && sizeOk && arrow, `${rows} แถว · ${sizes.slice(0, 3).join(" ")}…`);
const top0 = await q("return document.querySelector('.shelfwrap').scrollTop");
check("สลับเป็นตารางแล้วเลื่อนกลับบนสุด หัวชั้นไม่โดนตัด", top0 === 0, `เลื่อนอยู่ ${top0}`);
await shot("09-ตาราง.png");
// หัวตารางตรึง · เลื่อนลงแล้วหัวต้องชิดขอบบนของชั้นพอดี (ระยะ 0) และไม่มีแถวลอดเหนือหัว
await c.evaluate("document.querySelector('.shelfwrap').scrollTop = 400"); await sleep(250);
const stick = await q(`const w = document.querySelector('.shelfwrap').getBoundingClientRect(), th = document.querySelector('.lv thead th').getBoundingClientRect();
  // แถวที่มุดใต้หัวไม่นับ · ดูว่าจุดบนสุดกับจุดล่างสุดของหัวเป็นหัวจริง ไม่ใช่แถวที่ทะลุขึ้นมา
  const hit = (y) => !!document.elementFromPoint(th.left + 40, y)?.closest('thead');
  const above = !(hit(w.top + 1) && hit(th.bottom - 1));
  return { gap: Math.round((th.top - w.top) * 10) / 10, above, line: getComputedStyle(document.querySelector('.lv thead th')).boxShadow }`);
check("เลื่อนตารางลงแล้วหัวตารางตรึงชิดขอบบน ไม่มีแถวลอดเหนือหัว มีเส้นใต้หัว", stick.gap === 0 && !stick.above && stick.line.includes("inset"), `ระยะ ${stick.gap} · ${stick.line}`);
await c.move(100, 600); await sleep(200);
{ const w = await c.box(".shelfwrap"); await c.shotRect(`${OUT}/09ข-หัวตารางตรึง.png`, w.left, w.top - 6, w.right - w.left, 260); }
await c.evaluate(`[...document.querySelectorAll('[aria-label="มุมมอง"] button')].find(b => b.innerText.includes('ภาพปก')).click()`); await sleep(300);

// ค้นหา
const type = async (t) => { await c.evaluate("document.querySelector('.search input').focus()"); await c.type(t); await sleep(250); };
const clear = async () => { await c.click(".search .clr"); await sleep(200); };
await type("ดาว");
let r = await q("return { names: [...document.querySelectorAll('.book[data-movie]')].map(b => b.dataset.movie).sort(), hl: [...document.querySelectorAll('.book .hl')].map(h => h.innerText), head: document.querySelector('[data-statusbar]').innerText }");
const withDao = want.filter((n) => n.includes("ดาว")).sort();
check("พิมพ์ ดาว เจอทุกเรื่องที่ชื่อมีคำนี้ ไฮไลต์คำที่เจอทุกเรื่อง หัวชั้นบอกเจอกี่เรื่อง",
  r.names.join() === withDao.join() && r.hl.length === withDao.length && r.hl.every((h) => h === "ดาว") && r.head.startsWith(`เจอ ${withDao.length} จาก`), JSON.stringify(r));
await shot("10-ค้นหา.png", ".main", 0);
await clear();
await type("รพนื");
r = await q("return { names: [...document.querySelectorAll('.book[data-movie]')].map(b => b.dataset.movie), swap: document.querySelector('.search .swap')?.innerText, hl: document.querySelector('.book .hl')?.innerText }");
check("ลืมสลับแป้น พิมพ์ รพนื เจอ Iron Tide ขึ้นป้าย ค้นว่า iron", r.names.length === 1 && r.names[0] === "Iron Tide (2024)" && r.swap === "ค้นว่า iron" && r.hl === "Iron", JSON.stringify(r));
await shot("11-ลืมสลับแป้น.png", ".topbar", 0);
await clear();
await type("ฟ้าใส");
r = await q("return document.querySelector('.empty-search')?.innerText.replace(/\\n/g, ' / ')");
check("ค้นไม่เจอ ขึ้นคำบอกพร้อมปุ่มล้างคำค้น", r?.startsWith("ไม่มีหนังที่ชื่อมีคำว่า ฟ้าใส"), r);
await shot("12-ค้นไม่เจอ.png", ".shelfwrap", 0);
await c.click(".empty-search .btn"); await sleep(200);
check("กดล้างคำค้น ชั้นกลับมาครบ", (await names()).length === got.length);
await type("ดาว"); await c.key("Escape"); await sleep(200);
check("Esc ในช่องค้นหาล้างคำ", (await q("return document.querySelector('.search input').value")) === "");

// เรียง 6 แบบ
const kind = (m) => (m.status === "bad" ? 0 : m.ext !== "mkv" ? 2 : m.status === "ok" ? 3 : 1);
const lib = Object.fromEntries((await inv("get_library")).movies.map((m) => [m.name, m]));
const coll = new Intl.Collator("th");
const rules = {
  "name-asc": (a, b) => coll.compare(a.name, b.name) <= 0,
  "name-desc": (a, b) => coll.compare(a.name, b.name) >= 0,
  year: (a, b) => (a.year ?? -1) >= (b.year ?? -1),
  added: (a, b) => a.added >= b.added,
  size: (a, b) => a.size >= b.size,
  status: (a, b) => kind(a) <= kind(b),
};
for (const [key, ok] of Object.entries(rules)) {
  await c.evaluate("[...document.querySelectorAll('.topbar .dd')].find((d) => d.innerText.includes('เรียงตาม')).setAttribute('data-sortdd', '1')");
  await c.click("[data-sortdd]"); await sleep(150);
  const idx = Object.keys(rules).indexOf(key);
  await c.click(`.topbar .menu [role=option]:nth-child(${idx + 1})`); await sleep(250);
  const order = (await names()).map((n) => lib[n]);
  const bad = order.findIndex((m, i) => i > 0 && !ok(order[i - 1], m));
  const saved = (await inv("get_settings")).settings.sort;
  check(`เรียง ${key} ลำดับถูก จำค่าไว้`, bad === -1 && saved === key, bad === -1 ? `${order.slice(0, 3).map((m) => m.name).join(" · ")}…` : `ผิดที่ลำดับ ${bad}`);
}
await c.click(".topbar .dd"); await sleep(150);
{ // ถ่ายช่องเรียงกับรายการที่กางทั้งรายการ (เดิมใช้พิกัดตายตัว รายการโดนตัดขวา)
  await c.move(100, 600); await sleep(250);
  const d = await c.box(".topbar .dd"), m = await c.box(".topbar .menu");
  const x0 = Math.min(d.left, m.left) - 16, x1 = Math.max(d.right, m.right) + 16;
  await c.shotRect(`${OUT}/13-รายการเรียง.png`, x0, d.top - 12, x1 - x0, m.bottom - d.top + 24);
}
await c.click(".topbar .menu [role=option]:nth-child(1)"); await sleep(200);

// อ่านรอบสอง ไม่มีอะไรเปลี่ยน ต้องเร็ว
await c.click(".topbar .btn-ghost"); const s2 = await waitScan();
check("อ่านโฟลเดอร์ซ้ำ อ่านเฉพาะไฟล์ที่เปลี่ยน (เร็ว)", s2.ms < 3000 && (await names()).length === got.length, `${s2.ms} มิลลิวินาที`);

// ไดรฟ์ถอดออก
renameSync(MOVIES, MOVIES + "-ถอดออก");
try {
  await c.click(".topbar .btn-ghost"); await waitScan();
  r = await q("return { card: document.querySelector('[data-folder-missing] b')?.innerText, faded: [...document.querySelectorAll('.book')].filter(b => b.classList.contains('missing')).length, op: getComputedStyle(document.querySelector('.book')).opacity, play: document.querySelector('.detail .actions .btn')?.className }");
  check("โฟลเดอร์หาย ขึ้นการ์ดแดง หนังยังอยู่บนชั้นแบบจาง ปุ่มเปิดเล่นกดไม่ได้", r.card?.startsWith("หาโฟลเดอร์") && r.faded === got.length && r.op === "0.45" && r.play.includes("btn-wait"), JSON.stringify(r));
  await shot("14-ไดรฟ์ถอดออก.png", ".main", 0);
} finally {
  renameSync(MOVIES + "-ถอดออก", MOVIES);
}
await c.evaluate("[...document.querySelectorAll('[data-folder-missing] .btn')].find(b => b.innerText === 'ลองใหม่').click()"); await waitScan();
check("เสียบไดรฟ์กลับ กดลองใหม่ การ์ดหาย หนังกลับมาปกติ", !(await q("return !!document.querySelector('[data-folder-missing]')")) && !(await q("return !!document.querySelector('.book.missing')")));

// 500 เรื่อง
await inv("set_settings", { patch: { folders: [MOVIES, MANY] } });
await c.evaluate("location.reload()");
const s3 = await waitScan(600000);
const t0 = Date.now();
const count = await q("return document.querySelectorAll('.book[data-movie]').length");
const perf = await c.evaluate(`new Promise((ok) => {
  const el = document.querySelector('.shelfwrap'); const frames = []; let last = performance.now(); const end = last + 1500;
  const step = (t) => { frames.push(t - last); last = t; el.scrollTop += 120; if (t < end) requestAnimationFrame(step); else ok({ n: frames.length, worst: Math.round(Math.max(...frames.slice(1))), avg: Math.round(frames.reduce((a, b) => a + b, 0) / frames.length) }); };
  requestAnimationFrame(step);
})`);
check("หนัง 519 เรื่องขึ้นชั้นครบ เลื่อนลื่น ไม่ค้าง", count === got.length + 500 && perf.worst < 120, `อ่าน ${Math.round(s3.ms / 1000)} วินาที · ${count} เรื่อง · เลื่อน 1.5 วินาที ${perf.n} เฟรม เฟรมช้าสุด ${perf.worst} มิลลิวินาที เฉลี่ย ${perf.avg}`);
await shot("15-ห้าร้อยเรื่อง.png");
await inv("set_settings", { patch: { folders: [MOVIES] } });
await c.click(".topbar .btn-ghost"); const s4 = await waitScan();
check("เอาโฟลเดอร์ออกจากชั้น หนังของโฟลเดอร์นั้นหายจากชั้น", (await names()).length === got.length, `${s4.ms} มิลลิวินาที`);
await c.evaluate("document.querySelector('.shelfwrap').scrollTop = 0");

// เปิดเล่น เปิดโฟลเดอร์ · ทางที่ไม่สำเร็จต้องบอกเหตุผลเป็นภาษาไทย
// ทางที่สำเร็จเปิดโปรแกรมเล่นหนังหรือ Explorer ขึ้นมาบังจอพี่กัน ไม่รันในเทสอัตโนมัติ (เทสกับไฟล์จริงขั้น 6 และ 8)
// จับข้อผิดพลาดในหน้าเอง พอร์ตดีบักส่งกลับมาแค่ Uncaught (in promise) ไม่มีข้อความ
const errOf = (cmd, args) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then(() => "ไม่มีข้อผิดพลาด", (e) => String(e))`);
const someMovie = (await inv("get_library")).movies.find((m) => !m.missing).path;
const e1 = await errOf("play_movie", { path: "D:\\ไม่มีไฟล์นี้ (2020).mkv" });
const e2 = await errOf("reveal_movie", { path: "D:\\ไม่มีไฟล์นี้ (2020).mkv" });
await inv("set_settings", { patch: { playerPath: "D:\\ไม่มีโปรแกรมนี้\\player.exe" } });
const e3 = await errOf("play_movie", { path: someMovie });
await inv("set_settings", { patch: { playerPath: "" } });
check("เปิดเล่นหรือเปิดโฟลเดอร์ไฟล์ที่หาไม่เจอ บอกเหตุผล · โปรแกรมเล่นที่ตั้งไว้หายไป บอกให้ไปตั้งใหม่", e1.includes("หาไฟล์ไม่เจอ") && e2.includes("หาไฟล์ไม่เจอ") && e3.includes("หาโปรแกรมเล่นหนัง"), [e1, e2, e3].map((e) => e.replace(/^Error: /, "")).join(" | "));

writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 2) + "\n");
const failed = results.filter((x) => !x.pass);
console.log(`\nผ่าน ${results.length - failed.length} จาก ${results.length}`);
c.close();
process.exitCode = failed.length ? 1 : 0;
