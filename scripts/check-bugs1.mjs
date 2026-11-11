// ตัวตรวจบั๊กชุด 1 (docs/BUGS.md จัดหมวด 11 พ.ย. 2569) · ถ่ายภาพทุกจุดที่แก้ลง docs/report-2026-11-11/ชุด1/
// เปิดโปรแกรมโหมดพัฒนาก่อน (scripts/dev-app.ps1) · ไม่กดปุ่มเลือกไฟล์ บันทึก หรือเปิดเบราว์เซอร์ · ไฟล์หนังเป็นสำเนาใน D:\dev\tmp\ชั้นชุด1
// คลิปบอร์ดของ Windows เก็บข้อความเดิมไว้ก่อนลองปุ่มวาง แล้วคืนตอนจบ
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const ROOT = "D:/movie-shelf";
const OUT = `${ROOT}/docs/report-2026-11-11/ชุด1`; mkdirSync(OUT, { recursive: true });
const DIR = "D:\\dev\\tmp\\ชั้นชุด1"; rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
const MOVIE = join(DIR, "ดาวเหนือ (2023).mkv"); copyFileSync(`${ROOT}/test-media/สร้าง/หนัง/ดาวเหนือ (2023).mkv`, MOVIE);
const AVM = join(DIR, "ดาวตก (2024).mkv"); copyFileSync(`${ROOT}/test-media/สร้าง/เสียงซับ/ดาวตก (2024).mkv`, AVM);
const POSTER = `${ROOT}/test-media/สร้าง/รูป/poster.jpg`;
const SONG = `${ROOT}/test-media/สร้าง/เสียงซับ/เพลงทดสอบ 96k.flac`;
const BR = "D:/dev/tmp/ชั้นบิตเรต"; mkdirSync(BR, { recursive: true });
const VID = `${BR}/ตัวอย่างหนัง (2026).mkv`;
if (!existsSync(VID)) execFileSync(`${ROOT}/src-tauri/tools/ffmpeg.exe`, ["-v", "error", "-y", "-f", "lavfi", "-i",
  "testsrc2=duration=150:size=960x540:rate=24,noise=alls=4:allf=t:enable='between(t,18,48)',noise=alls=9:allf=t:enable='between(t,48,66)',noise=alls=16:allf=t+u:enable='between(t,92,104)',noise=alls=6:allf=t:enable='between(t,118,150)'",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=150", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", "48", "-bf", "3", "-c:a", "aac", "-b:a", "128k", VID]);

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const waitFor = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(150); } return false; };
const size = (w, h) => c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
const nav = async (label) => { await q(`[...document.querySelectorAll("button,a")].find(b => b.innerText.trim().split(/\\s*\\n/)[0] ===${JSON.stringify(label)})?.click()`); await sleep(500); };
const tag = (sel, id) => q(`const el = ${sel}; if (el) el.id = ${JSON.stringify(id)}; return !!el`);
const shot = async (f, sel, pad = 6) => { await c.move(2, 790); await sleep(200); return c.shot(`${OUT}/${f}.png`, sel, pad); };

await size(1280, 800);
await inv("set_settings", { patch: { folders: [DIR] } });
await c.evaluate("location.hash = ''; location.reload()"); await sleep(3000);

/* ---------- ตั้งค่า หน้าขอบคุณ ข้อ 3 4 5 ---------- */
await nav("ตั้งค่า"); await c.setNav("thanks"); await sleep(300);
await tag(`[...document.querySelectorAll('.thankcard')].find(x => x.innerText.includes('qaac'))`, "__qaac");
const qa = await q(`const k = document.getElementById('__qaac'), t = k.querySelector('.thanktag').getBoundingClientRect(), n = k.querySelector('.thankname').getBoundingClientRect(); return { lines: k.querySelectorAll('.thanktag > span').length, block: getComputedStyle(k.querySelector('.thanktag > span')).display, dTop: Math.round(t.top - n.top), right: Math.round(k.getBoundingClientRect().right - t.right) }`);
check("ข้อ 3 ป้ายสัญญา qaac สองบรรทัด อยู่มุมขวาบนแถวเดียวกับชื่อ", qa.lines === 2 && qa.block === "block" && Math.abs(qa.dTop) <= 4 && qa.right <= 14, JSON.stringify(qa));
await shot("03-ป้ายสัญญา-qaac", "#__qaac");
const offRow = await q(`return [...document.querySelectorAll('.thankcard')].filter(k => { const t = k.querySelector('.thanktag').getBoundingClientRect(), n = k.querySelector('.thankhead').getBoundingClientRect(); return Math.abs(t.top - n.top) > 4 || t.right < n.right - 2; }).map(k => k.querySelector('.thankname b').innerText)`);
check("ข้อ 3 ป้ายของทุกการ์ดอยู่มุมขวาบนของหัวการ์ด", offRow.length === 0, offRow.join(" · ") || `${await q("return document.querySelectorAll('.thankcard').length")} การ์ด`);
// ตัดคำ · ทุกวลีในคำอธิบายต้องอยู่บรรทัดเดียว ทั้งหน้าต่าง 1280 และเต็มจอ 1920
for (const [w, h] of [[1280, 800], [1920, 1040], [1024, 720]]) {
  await size(w, h); await sleep(400);
  const broken = await q(`const seg = new Intl.Segmenter('th', { granularity: 'word' }); const out = []; for (const box of document.querySelectorAll('.thankwhat')) { const w = document.createTreeWalker(box, NodeFilter.SHOW_TEXT); let full = '', idx = [], last = null; for (let n; (n = w.nextNode());) { for (let i = 0; i < n.data.length; i++) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const rc = r.getClientRects()[0]; if (rc && last !== null && rc.top - last > 4 && !/\\s/.test(n.data[i]) && !/\\s/.test(full.slice(-1))) idx.push(full.length); if (rc) last = rc.top; full += n.data[i]; } } const bounds = new Set([...seg.segment(full)].map((x) => x.index)); for (const i of idx) if (!bounds.has(i)) out.push(full.slice(Math.max(0, i - 6), i) + '|' + full.slice(i, i + 6)); } return out;`);
  check(`ข้อ 4 คำอธิบายการ์ดไม่ตัดกลางคำ หน้าต่าง ${w}`, broken.length === 0, broken.join(" · ") || "ทุกจุดที่ขึ้นบรรทัดใหม่อยู่ที่ขอบคำ");
}
await size(1920, 1040); await sleep(300);
await tag(`[...document.querySelectorAll('.thankcard')].find(x => x.innerText.includes('FFmpeg'))`, "__ff");
await shot("04-เต็มจอ-การ์ด-FFmpeg", "#__ff");
await size(1280, 800); await sleep(300);
await q(`const s = document.querySelector('[data-setcard=thanks]'); let p = s; while (p && getComputedStyle(p).overflowY !== 'auto') p = p.parentElement; p.scrollTop = 520;`); await sleep(300);
const h3 = await q(`const h = document.querySelector('[data-setcard=thanks] > h3'), s = getComputedStyle(h); return { line: s.borderBottomWidth + ' ' + s.borderBottomStyle, top: Math.round(h.getBoundingClientRect().top) }`);
check("ข้อ 5 หัว ขอบคุณ ตรึงไว้ มีเส้นแบ่งใต้หัว", h3.line === "1px solid", JSON.stringify(h3));
const hb = await c.box("[data-setcard=thanks] > h3");
await c.shotRect(`${OUT}/05-หัวขอบคุณมีเส้นแบ่ง.png`, Math.max(0, hb.left - 40), Math.max(0, hb.top - 4), Math.min(900, hb.w + 80), 150);
await q(`const s = document.querySelector('[data-setcard=thanks]'); let p = s; while (p && getComputedStyle(p).overflowY !== 'auto') p = p.parentElement; p.scrollTop = 0;`);

/* ---------- ข้อ 6 Chroma subsampling ---------- */
const ids = await q(`return [...document.querySelectorAll('[data-setnav]')].map(b => b.dataset.setnav)`);
for (const id of ids) { await c.setNav(id); if (await q(`const r = document.querySelector('[data-img-row=sub]'); return !!r && r.offsetParent !== null`)) break; }
const sub = await q(`return document.querySelector('[data-img-row=sub] .lbl')?.firstChild?.textContent`);
check("ข้อ 6 ชื่อแถวเป็น Chroma subsampling ไม่มีคำว่า การย่อสี", sub === "Chroma subsampling" && !(await q("return document.body.innerText.includes('การย่อสี')")), sub);
await shot("06-Chroma-subsampling", "[data-img-row=sub]");

/* ---------- เสียงและซับ ข้อ 10 32 ---------- */
await nav("เสียงและซับ");
await c.evaluate(`window.__avDrop(${JSON.stringify([AVM])}, 400, 300)`);
await waitFor("return document.querySelectorAll('.trk:not(.head)').length > 2 && !!document.querySelector('.avdrop')", 30000);
const ad = await q(`const s = getComputedStyle(document.querySelector('.avdrop')), b = getComputedStyle(document.querySelector('.avdrop'), '::before'); return { bg: s.backgroundImage.slice(0, 15), border: s.borderTopStyle, icon: b.backgroundColor }`);
check("ข้อ 10 แถบลากไฟล์เพิ่ม พื้นไล่โทน ขอบประ ไอคอนในวงกลมสีหลัก", ad.bg.startsWith("linear-gradient") && ad.border === "dashed" && ad.icon !== "rgba(0, 0, 0, 0)", JSON.stringify(ad));
await shot("10-แถบลากไฟล์เพิ่มไล่โทน", ".avdrop");
const land = await c.box("[data-slot=cover_land]");
await c.evaluate(`window.__avDrop(${JSON.stringify([POSTER])}, ${Math.round(land.x)}, ${Math.round(land.y)})`);
await waitFor("return !!document.querySelector('[data-previews-wide]') && [...document.querySelectorAll('.dlg img')].every(i => i.complete && i.naturalWidth > 0)", 20000); await sleep(800);
const pv = await q(`const cells = [...document.querySelectorAll('[data-previews-wide] > div')], big = cells[0].getBoundingClientRect(), row = cells[1].getBoundingClientRect(), imgs = [...document.querySelectorAll('.dlg img')]; return { bigW: Math.round(big.width), bigH: Math.round(big.height), rowTop: Math.round(row.top - big.bottom), rowKids: cells[1].children.length, imgsOk: imgs.filter(i => i.complete && i.naturalWidth > 0).length + '/' + imgs.length, head: document.querySelector('.dlg .small')?.innerText.replace(/\\s+/g, ' ') }`);
check("ข้อ 32 ลากรูปแนวตั้งลงช่องปกนอน หน้าครอปเป็นกรอบนอน · แผงรายละเอียดใหญ่ครึ่งบน อีกสองรูปแถวล่าง · รูปโหลดครบ · หัวไม่บอกพอดีปก", pv.bigW > 250 && pv.rowKids === 2 && pv.rowTop >= 0 && pv.imgsOk.split("/")[0] === pv.imgsOk.split("/")[1] && !/พอดีปก/.test(pv.head), JSON.stringify(pv));
await shot("32-ช่องปกนอนครอปเป็นแนวนอน", ".dlg", 0);
await c.key("Escape"); await sleep(400);

/* ---------- ข้อ 31 ปุ่มวางในช่องค่า hash ---------- */
await nav("ชั้นวางหนัง"); await waitFor(`return !!document.querySelector('.book[data-movie="ดาวเหนือ (2023)"]')`, 30000);
await c.book("ดาวเหนือ (2023)"); await sleep(400);
await q(`[...document.querySelectorAll('.detail .btn')].find(b => b.innerText.includes('MediaInfo'))?.click()`);
await waitFor("return !!document.querySelector('[data-hash-start], [data-hash-paste]')", 15000);
await q(`document.querySelector('[data-hash-start]')?.click()`);
await waitFor("return !!document.querySelector('[data-hash-paste]')", 30000);
const ph = await q(`return document.querySelector('[data-hash-paste]')?.closest('.inp')?.querySelector('.sb-draw span')?.innerText`);
const clipOld = spawnSync("powershell", ["-NoProfile", "-Command", "Get-Clipboard -Raw"], { encoding: "utf8" }).stdout ?? "";
// ใส่ข้อความทดสอบก่อนกดวางทันที แล้วคืนข้อความเดิมของพี่กันทันทีหลังกด แม้ขั้นอื่นล้ม (11 พ.ย. 2569 รอบแรกล้มก่อนคืน ข้อความเดิมหาย)
const clipBack = () => spawnSync("powershell", ["-NoProfile", "-Command", "Set-Clipboard -Value $env:CLIP_OLD"], { env: { ...process.env, CLIP_OLD: clipOld.replace(/\r?\n$/, "") } });
try {
  spawnSync("powershell", ["-NoProfile", "-Command", "Set-Clipboard -Value $env:CLIP_T"], { env: { ...process.env, CLIP_T: "ไม่ใช่ค่า hash" } });
  await c.click("[data-hash-paste]"); await sleep(700);
} finally { clipBack(); }
const pasted = await q(`return { v: document.querySelector('[data-hash-paste]').closest('.inp').querySelector('input').value, clear: !!document.querySelector('[data-hash-clear]'), hint: document.querySelector('[data-hash-paste]').closest('div[style]')?.innerText.includes('ไม่ใช่ค่า hash แบบที่รู้จัก') }`);
check("ข้อ 31 ช่องว่างมีข้อความจางบอกชนิด hash · กดปุ่มวาง ข้อความจากคลิปบอร์ดเข้าช่อง เทียบทันที มีปุ่มล้าง", /SHA-256/.test(ph ?? "") && pasted.v === "ไม่ใช่ค่า hash" && pasted.clear && pasted.hint, `ข้อความจาง ${ph} · ${JSON.stringify(pasted)}`);
await tag(`document.querySelector('[data-hash-paste]').closest('.inp').parentElement`, "__hashbox");
await shot("31-ช่องค่า-hash", "#__hashbox");
await c.click("[data-hash-clear]"); await sleep(200);
check("ข้อ 31 กดล้างแล้วช่องว่าง", await q(`return document.querySelector('[data-hash-paste]').closest('.inp').querySelector('input').value === ''`));

/* ---------- ข้อ 13 กราฟแท่งซูมแนวตั้ง ---------- */
await nav("กราฟเสียง");
await c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: [${JSON.stringify(SONG)}], position: { x: 700, y: 400 } } })`);
await waitFor(`return (document.querySelector('.fchip .nm')?.innerText ?? '').startsWith('เพลงทดสอบ 96k')`, 15000); await sleep(2500);
await q(`document.querySelector('[data-style=bars]')?.click()`); await sleep(800);
// ความสูงแท่งสูงสุดในการ์ดแรก วัดจากพิกเซลที่ไม่ใช่สีพื้น · ใช้ผืนวาดที่ใหญ่ที่สุดในหน้า (การ์ดช่องแรก) ไม่ใช่แถบภาพรวมด้านบน
const barH = () => q(`const cv = [...document.querySelectorAll('canvas')].filter(x => x.offsetParent).sort((a, b) => b.width * b.height - a.width * a.height)[0]; const g = cv.getContext('2d'), w = cv.width, h = cv.height, d = g.getImageData(0, 0, w, h).data, bg = [d[0], d[1], d[2]]; let top = h, bot = 0; for (let y = 0; y < h; y++) for (let x = 0; x < w; x += 3) { const o = (y * w + x) * 4; if (Math.abs(d[o] - bg[0]) + Math.abs(d[o + 1] - bg[1]) + Math.abs(d[o + 2] - bg[2]) > 60) { if (y < top) top = y; if (y > bot) bot = y; } } return { span: bot - top, h };`);
const b1 = await barH();
await c.click("[data-vzknob]"); for (let i = 0; i < 6; i++) await c.key("ArrowUp"); await sleep(800);
const b2 = await barH();
check("ข้อ 13 มุมมองแท่ง ซูมแนวตั้งแล้วแท่งสูงขึ้น", b2.span > b1.span + 5, `ก่อน ${b1.span} หลัง ${b2.span} จากกรอบ ${b1.h}`);
await shot("13-แท่งซูมแนวตั้ง", ".plot", 0).catch(() => {});
await c.key("Home"); await sleep(200);
await q(`document.querySelector('[data-style=fine]')?.click()`);

/* ---------- บิตเรตแบบใหม่ ข้อ 1 43 ---------- */
await nav("บิตเรต"); await q(`window.__bitrateView('new')`); await sleep(500);
await q(`window.__brnOpen(${JSON.stringify(VID)})`); await sleep(1500);
await q(`document.querySelector('[data-brnpick="v"]')?.click()`);
await waitFor(`return !document.querySelector('[data-brnprog]') && /เฉลี่ย\\s+\\d/.test(document.querySelector('.brn-side')?.innerText ?? '')`, 90000);
await q(`const b = document.querySelector('[data-brnline=min]'); if (b && b.getAttribute('aria-pressed') !== 'true') b.click()`); await sleep(500);
const pl = await c.box("[data-brnplot]");
await c.shotRect(`${OUT}/01-ป้ายต่ำสุดไม่โดนตัด.png`, Math.round(pl.right - 420), Math.round(pl.bottom - 110), 430, 130);
await c.shotRect(`${OUT}/43-ทั้งไฟล์แท่งมีช่องคั่น.png`, Math.round(pl.left + 20), Math.round(pl.top + pl.h * 0.35), 260, Math.round(pl.h * 0.65));
// ช่องคั่น · นับช่วงสีพื้นที่แทรกระหว่างแท่งในแถวล่างของกราฟ
// หน้าต่าง 1024 แท่ง 150 วินาทีกว้างราว 3 ถึง 4 จุด ช่วงที่โค้ดเดิมไม่เว้นช่อง (เว้นเฉพาะกว้างเกิน 4) · พื้นผืนวาดโปร่งใส ช่องคั่นคือจุดที่โปร่งใส
// ปิดเส้นต่ำสุดก่อนวัด เส้นประพาดผ่านแถวที่วัดแล้วอุดช่อง · วัดหลายแถวเอาค่ามากสุด กันเส้นค่าเฉลี่ยสะสมพาดผ่าน
await q(`document.querySelector('[data-brnline=min]')?.click()`);
await size(1024, 720); await sleep(900);
const gaps = await q(`const cv = document.querySelector('[data-brnplot] canvas'); const g = cv.getContext('2d'), r = cv.getBoundingClientRect(), k = cv.width / r.width; let best = 0; for (const dy of [32, 36, 40, 44, 48]) { const y = Math.round(cv.height - dy * k); const d = g.getImageData(0, y, cv.width, 1).data, x0 = Math.round(80 * k); const W = cv.width - Math.round(30 * k), bgAt = (x) => d[x * 4 + 3] < 10; let runs = 0, inBar = false; for (let x = x0; x < W; x++) { const isBg = bgAt(x); if (!isBg && !inBar) { runs++; inBar = true; } else if (isBg) inBar = false; } best = Math.max(best, runs); } return best;`);
const barW = await q(`const cv = document.querySelector('[data-brnplot] canvas'); return +(cv.getBoundingClientRect().width / 150).toFixed(2)`);
// เกณฑ์ 50 แท่ง โค้ดเดิมที่แท่งติดกันนับได้ 2 แท่ง · แถวที่วัดบางแท่งโดนเส้นค่าเฉลี่ยพาด นับได้ราว 69 ถึง 75 (11 พ.ย. 2569)
check("ข้อ 43 ดูทั้งไฟล์ที่หน้าต่าง 1024 แท่งแยกกันมีช่องคั่น (นับแท่งแถวล่าง)", gaps >= 50, `${gaps} แท่ง · กว้างราว ${barW} จุดต่อวินาที (โค้ดเดิมนับได้ 2 แท่ง คือติดกันเป็นก้อน)`);
await c.shotRect(`${OUT}/43-ทั้งไฟล์แท่งมีช่องคั่น-1024.png`, Math.round((await c.box("[data-brnplot]")).left + 20), Math.round((await c.box("[data-brnplot]")).bottom - 160), 240, 160);
await size(1280, 800); await sleep(500);

/* ---------- แบบ Bitrate Viewer ข้อ 45 46 47 ---------- */
await q(`window.__bitrateView('classic')`); await sleep(500);
await q(`window.__bitrateOpen(${JSON.stringify(VID)}, 'v')`);
await waitFor(`return /MIN = /.test(document.querySelector('[data-bv-stats]')?.innerText ?? '')`, 90000); await sleep(500);
const head0 = await q(`const b = document.querySelector('[data-bvmodern]').getBoundingClientRect(), a = document.querySelector('[data-bv-panel] [data-bv-zoomflag]').parentElement.getBoundingClientRect(), p = document.querySelector('[data-bv-panel]').children[1].getBoundingClientRect(); return { btn: Math.round(b.left), avg: Math.round(p.top), reset: !!document.querySelector('[data-bv-reset]') }`);
const bp = await c.box("[data-bv-plot]");
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: bp.x, y: bp.y, deltaX: 0, deltaY: 120 }); await sleep(500);
await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: bp.x - 100, y: bp.y, deltaX: 0, deltaY: 120 }); await sleep(500);
const head1 = await q(`const b = document.querySelector('[data-bvmodern]').getBoundingClientRect(), p = document.querySelector('[data-bv-panel]').children[1].getBoundingClientRect(); return { btn: Math.round(b.left), avg: Math.round(p.top), stat: document.querySelector('[data-bv-zoomstat]').innerText, flag: document.querySelector('[data-bv-zoomflag]').innerText }`);
check("ข้อ 45 ซูมแล้ว Average Bitrate ไม่ถูกดันลง ปุ่มแบบชั้นหนังไม่ขยับ", head0.avg === head1.avg && head0.btn === head1.btn, `${JSON.stringify(head0)} → ${JSON.stringify(head1)}`);
await c.shot(`${OUT}/45-46-แผงขวาตอนซูม.png`, "[data-bv-panel]", 4);
// ลากแถบสีส้ม
const zl = () => q(`return document.querySelector('[data-bv-zoombar] > div')?.style.left`);
const l0 = await zl(), zb = await c.box("[data-bv-zoombar] > div");
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: zb.x, y: zb.y, button: "left", buttons: 1, clickCount: 1 });
for (let i = 1; i <= 6; i++) { await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: zb.x + i * 30, y: zb.y, buttons: 1 }); await sleep(40); }
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: zb.x + 180, y: zb.y, button: "left", buttons: 0, clickCount: 1 }); await sleep(400);
const l1 = await zl();
check("ข้อ 47 ลากแถบสีส้มแล้วช่วงที่ดูเลื่อนตาม", parseFloat(l1) > parseFloat(l0) + 3, `${l0} → ${l1}`);
const head2 = await q(`return Math.round(document.querySelector('[data-bvmodern]').getBoundingClientRect().left)`);
check("ข้อ 45 เลื่อนช่วงแล้วปุ่มแบบชั้นหนังยังอยู่ที่เดิม", head2 === head0.btn, `${head0.btn} → ${head2}`);
await c.click("[data-bv-reset]"); await sleep(400);
const after = await q(`return { zoom: !!document.querySelector('[data-bv-zoombar] > div'), vis: getComputedStyle(document.querySelector('[data-bv-zoomflag]').parentElement).visibility, avg: Math.round(document.querySelector('[data-bv-panel]').children[1].getBoundingClientRect().top) }`);
check("ข้อ 46 กดปุ่ม Reset กลับดูทั้งไฟล์ บรรทัด ZOOM ซ่อนแต่ยังจองที่", !after.zoom && after.vis === "hidden" && after.avg === head0.avg, JSON.stringify(after));
await q(`window.__bitrateView('new')`);

await size(1280, 800);
console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
process.exit(fail ? 1 : 0);
