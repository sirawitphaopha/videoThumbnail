// ชุด 11 ของ BUGS.md ข้อ 98 ถึง 101 · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-subchap.mjs
// 98 ปุ่มดูซับมีคำในแถวซับ · 99 ดูและแก้บท (ไม่รวมไฟล์จริง เทสรวมไฟล์ที่แก้บทอยู่ cargo test merge_with_edited_chapters_real_files)
// 100 หน้าต่างดูซับสูงเท่ากันทุกแบบการดู · 101 เมนูซับไตเติล · 104 ใส่ไฟล์แล้วดูซับในหน้าซับไตเติล
import { mkdirSync, rmSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-13/ชุด11";
mkdirSync(OUT, { recursive: true });
const MOVIE = "D:/movie-shelf/test-media/สร้าง/หนัง/ดาวเหนือ (2023).mkv";
const XDIR = "D:/movie-shelf/test-media/สร้าง/หนัง/ดาวเหนือ (2023) แยกไฟล์";
const SRT = "D:/movie-shelf/test-media/สร้าง/เสียงซับ/ดาวตก (2024).th.srt";
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click();`);
const AV = "[data-pageslot=av]";
/** เลื่อนกรอบที่เลื่อนได้ทุกชั้นของหน้าซับไตเติลกลับขึ้นบนสุด ก่อนถ่ายภาพการ์ดไฟล์ ไม่ให้แถบบนที่ตรึงไว้บังหัวการ์ด */
const subTop = () => q("for (let p = document.querySelector('[data-sub-bar]'); p; p = p.parentElement) if (p.scrollHeight > p.clientHeight) p.scrollTop = 0; return 1;");

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const tpBefore = await q("return localStorage.getItem('ms.trackPanel');");
try {
  // ---------- 101 เมนูซับไตเติล ----------
  const items = await q("return [...document.querySelectorAll('.side .nav:not(.navtoggle)')].map((b) => b.innerText.trim().split('\\n')[0]);");
  const ia = items.indexOf("เสียงและซับ"), is = items.indexOf("ซับไตเติล");
  check("เมนูซ้ายมีซับไตเติลต่อจากเสียงและซับ (BUGS 101)", ia >= 0 && is === ia + 1, JSON.stringify(items));
  await nav("ซับไตเติล"); await sleep(500);
  const sp = await q("const p = document.querySelector('[data-subtitle-page]'); return p ? { t: p.innerText.replace(/\\s+/g, ' ').slice(0, 80), btn: !!p.querySelector('[data-subtitle-go-av]'), vis: p.getBoundingClientRect().width > 0 } : null;");
  check("หน้าซับไตเติลมีปุ่มไปหน้าเสียงและซับ", sp?.vis && sp.btn, JSON.stringify(sp));
  await c.shot(`${OUT}/20b-เมนูซับไตเติล.png`, "[data-navbar]", 0);
  // ---------- 104 ใส่ไฟล์แล้วดูซับในหน้านี้ ----------
  await q("window.__subClear?.()"); await sleep(300);
  const dz = await q("const d = document.querySelector('[data-drop=subtitle]'); return d ? { t: d.innerText.replace(/\\s+/g, ' '), btn: !!d.querySelector('button') } : null;");
  check("หน้าซับไตเติลมีจุดลากไฟล์กับปุ่มเลือกไฟล์แบบหน้าอื่น (BUGS 104)", dz?.btn && dz.t.includes("ลากไฟล์หนังหรือไฟล์ซับ"), JSON.stringify(dz));
  await c.shot(`${OUT}/30-หน้าซับไตเติล-ว่าง.png`, "[data-subtitle-page] .ag", 8);
  rmSync(XDIR, { recursive: true, force: true });
  await q(`window.__subOpen(${JSON.stringify(MOVIE)})`);
  await waitFor("return document.querySelectorAll('[data-sub-pick]').length > 0;", 15000);
  const list = await q("return [...document.querySelectorAll('[data-sub-pick]')].map((b) => b.innerText.replace(/\\s+/g, ' ').trim());");
  const pressed = await q("return [...document.querySelectorAll('[data-sub-pick]')].map((b) => b.getAttribute('aria-pressed'));");
  check("ใส่ไฟล์หนังแล้วขึ้นแถบแทร็กซับทุกแทร็ก แทร็กแรกเลือกอยู่", list.length >= 2 && pressed[0] === "true" && pressed.slice(1).every((x) => x === "false"), JSON.stringify({ list, pressed }));
  // เปิดซับแล้วจุดลากไฟล์ใหญ่หายไป ตัวดูซับขึ้นมาใกล้บน (BUGS ข้อ 109 "ย้ายปุ่มอัปซับไปที่อื่น มันโคตรกินที่")
  const lay = await q("const v = document.querySelector('[data-subviewer-inline]'); return { drop: !!document.querySelector('[data-drop=subtitle]'), other: !!document.querySelector('[data-sub-openother]'), top: v ? Math.round(v.getBoundingClientRect().top) : null };");
  check("เปิดซับแล้วจุดลากไฟล์ใหญ่หายไป แถวบนมีปุ่มเปิดไฟล์อื่น ตัวดูซับเริ่มที่ครึ่งบนของจอ (BUGS 109)", !lay.drop && lay.other && lay.top != null && lay.top < 260, JSON.stringify(lay));
  // ตัวดูซับแสดงในหน้าเลย ไม่ใช่หน้าต่างซ้อน (พี่กันทัก "ตัวซับจะเปิดได้ที่หน้านี้เลย")
  const inl = await waitFor("return !!document.querySelector('[data-subviewer-inline] [data-sub-table]') && !document.querySelector('[role=dialog]');", 15000);
  await sleep(1500);
  const fr = await q("return document.querySelector('[data-subviewer-inline] [data-vframe] img') ? 'มีภาพ' : document.querySelector('[data-vframe]')?.innerText.trim();");
  check("ตัวดูซับแสดงในหน้าซับไตเติลเลย ไม่มีหน้าต่างซ้อน เห็นภาพหนังตรงบรรทัดที่เลือก (BUGS 104)", inl && fr === "มีภาพ", fr);
  await subTop(); await sleep(150);
  await c.shot(`${OUT}/31-หน้าซับไตเติล-เปิดไฟล์แล้ว.png`, "[data-subtitle-page] .ag", 0);
  await c.shot(`${OUT}/32-หน้าซับไตเติล-ดูซับในหน้า.png`, "[data-subviewer-inline]", 8);
  await c.click("[data-sub-pick='1']"); await sleep(800);
  check("กดซับแถวที่สอง ตัวดูซับเปลี่ยนเป็นซับนั้น", await q("return /ASS/.test(document.querySelector('[data-subviewer-inline] [data-subviewer] > .small')?.innerText ?? '') && document.querySelector('[data-sub-pick=\"1\"]').getAttribute('aria-pressed') === 'true';"));

  // ---------- 108 Export ----------
  await waitFor("return document.querySelector('[data-sub-export=\"0\"]')?.getAttribute('aria-disabled') !== 'true';", 10000);
  const ew = await q("return Math.round(document.querySelector('[data-sub-export=\"0\"]').getBoundingClientRect().width);");
  await c.click("[data-sub-export='0']");
  const ok1 = await waitFor("return document.querySelector('[data-sub-exp]')?.getAttribute('data-sub-exp') === 'done';", 20000);
  const t1 = await q("return document.querySelector('[data-sub-exp]')?.innerText.replace(/\\s+/g, ' ');");
  const ew2 = await q("return Math.round(document.querySelector('[data-sub-export=\"0\"]').getBoundingClientRect().width);");
  check("กด Export ได้ไฟล์ซับชนิดเดิมในโฟลเดอร์แยกไฟล์ข้างหนัง ปุ่มกว้างเท่าเดิม (BUGS 108)", ok1 && /\.srt/.test(t1) && ew === ew2, JSON.stringify({ t1, ew, ew2 }));
  await subTop(); await sleep(150);
  const eb = await q("const a = document.querySelector('[data-sub-bar]').getBoundingClientRect(), b = document.querySelector('[data-sub-exp]').getBoundingClientRect(); return [Math.round(a.left), Math.round(a.top), Math.round(a.width), Math.round(b.bottom - a.top + 8)];");
  await c.shotRect(`${OUT}/35-หน้าซับไตเติล-Export-แล้ว.png`, ...eb);
  await q("window.__openDry = true; window.__openDryLog = [];");
  await c.click("[data-sub-reveal]"); await sleep(200);
  check("ปุ่มเปิดโฟลเดอร์ชี้ไฟล์ที่ Export (ตัวตรวจกันไม่ให้ Explorer เด้ง)", await q("return (window.__openDryLog ?? []).some((x) => /\\.srt$/.test(x));"));
  await c.click("[data-sub-export='0']");
  const cf = await waitFor("return document.querySelector('[data-sub-exp]')?.getAttribute('data-sub-exp') === 'conflict';", 20000);
  await c.shot(`${OUT}/36-หน้าซับไตเติล-Export-ชื่อชน.png`, "[data-sub-exp]", 8);
  await c.click("[data-sub-renum]");
  const ok2 = await waitFor("return document.querySelector('[data-sub-exp]')?.getAttribute('data-sub-exp') === 'done';", 20000);
  const t2 = await q("return document.querySelector('[data-sub-exp]')?.innerText.replace(/\\s+/g, ' ');");
  check("Export ซ้ำ ถามก่อนว่าชื่อชน กดตั้งชื่อใหม่แล้วได้ไฟล์ใหม่ ไม่เขียนทับ", cf && ok2 && t2 !== t1, JSON.stringify({ t2 }));

  // ---------- เพิ่มไฟล์ซับคู่กับหนัง ----------
  await q(`window.__subAddSub(${JSON.stringify(SRT)})`);
  await waitFor("return document.querySelectorAll('[data-sub-pick]').length === 3;", 15000);
  await sleep(1200);
  const added = await q("const b = document.querySelector('[data-sub-pick=\"2\"]'); return { t: b.innerText.replace(/\\s+/g, ' '), on: b.getAttribute('aria-pressed'), exp: !!document.querySelector('[data-sub-export=\"2\"]'), img: !!document.querySelector('[data-subviewer-inline] [data-vframe] img') };");
  check("เพิ่มไฟล์ซับคู่กับหนัง ขึ้นเป็นแถวใหม่ ดูพร้อมภาพหนัง ไม่มีปุ่ม Export เพราะเป็นไฟล์อยู่แล้ว", added.t.includes("th.srt") && added.on === "true" && !added.exp && added.img, JSON.stringify(added));

  // ---------- 107 ไฟล์ซับอย่างเดียว เพิ่มวิดีโอ ----------
  await q(`window.__subOpen(${JSON.stringify(SRT)})`);
  const auto = await waitFor("return !!document.querySelector('[data-subviewer-inline] [data-sub-table]');", 15000);
  await sleep(600);
  const fr2 = await q("const v = document.querySelector('[data-vframe]'); return { t: v?.innerText.trim(), btn: !!v?.querySelector('[data-sub-addvideo]'), play: !!document.querySelector('[data-sub-play]') };");
  check("ใส่ไฟล์ซับอย่างเดียว ตัวดูซับขึ้นในหน้า บอกว่าไม่มีภาพหนัง มีปุ่มเพิ่มไฟล์วิดีโอ ไม่มีปุ่มเปิดเล่น (BUGS 107)", auto && fr2.t.includes("ไม่มีภาพหนัง") && fr2.btn && !fr2.play, JSON.stringify(fr2));
  await c.shot(`${OUT}/33-หน้าซับไตเติล-ไฟล์ซับ.png`, "[data-subviewer-inline]", 8);
  await subTop(); await sleep(150);
  await c.shot(`${OUT}/37-หน้าซับไตเติล-เพิ่มวิดีโอ.png`, "[data-sub-bar]", 8);
  await q(`window.__subVideo(${JSON.stringify(MOVIE)})`);
  const vid = await waitFor("return !!document.querySelector('[data-subviewer-inline] [data-vframe] img') && !!document.querySelector('[data-subviewer-inline] canvas[data-aud]');", 20000);
  const vt = await q("return document.querySelector('[data-sub-bar]')?.innerText.replace(/\\s+/g, ' ');");
  check("เพิ่มไฟล์วิดีโอแล้ว เห็นภาพหนังกับคลื่นเสียงคู่กับซับ บอกชื่อวิดีโอ ปุ่มเปลี่ยนเป็นเปลี่ยนไฟล์วิดีโอ", vid && vt.includes("ดาวเหนือ") && vt.includes("เปลี่ยนไฟล์วิดีโอ"), vt);
  await sleep(600);
  await c.shot(`${OUT}/38-หน้าซับไตเติล-ซับคู่วิดีโอ.png`, "[data-subviewer-inline]", 8);

  await q(`window.__subOpen("D:/movie-shelf/test-media/สร้าง/เสียงซับ/เพลงทดสอบ.mp3")`); await sleep(400);
  // เปิดไฟล์อยู่ จุดลากไฟล์ซ่อน คำเตือนขึ้นเป็นการ์ดแดงใต้แถวบน (BUGS ข้อ 109)
  const wrong = await q("return (document.querySelector('[data-sub-err]') ?? document.querySelector('[data-drop=subtitle]'))?.innerText ?? '';");
  check("ไฟล์ชนิดอื่นบอกว่าไม่ใช่ไฟล์หนังหรือไฟล์ซับ", wrong.includes("ไม่ใช่ไฟล์หนังหรือไฟล์ซับ"), wrong.slice(0, 60));
  // ล้างหน้ากลับเป็นว่าง ไม่ทิ้งจุดลากไฟล์สีแดงหรือไฟล์ทดสอบค้างให้พี่กันเห็น (พี่กันทัก "เราใช้สีนี้เหรอ")
  await q("window.__subClear?.()"); await sleep(300);
  check("ตัวตรวจล้างหน้าซับไตเติลกลับเป็นว่าง ไม่มีสีแดงค้าง", await q("return !document.querySelector('[data-drop=subtitle].bad') && !document.querySelector('[data-sub-file]');"));
  await c.click("[data-subtitle-go-av]"); await sleep(500);
  check("กดไปหน้าเสียงและซับแล้วไปจริง", await q("return document.querySelector('.side .nav.on')?.innerText.trim().split('\\n')[0] === 'เสียงและซับ';"));

  // ---------- 98 ปุ่มดูซับ ----------
  await q(`window.__avDrop([${JSON.stringify(MOVIE)}], 400, 300)`);
  await waitFor(`return document.querySelectorAll('${AV} [data-trk]').length > 2;`, 20000);
  await sleep(600);
  await c.click(`${AV} .avm-card[data-mode="merge"]`); await sleep(300);
  const sb = await q(`return [...document.querySelectorAll('${AV} [data-subview]')].map((b) => { const r = b.getBoundingClientRect(), row = b.closest('[data-trk]').getBoundingClientRect(); return { t: b.innerText.trim(), h: Math.round(r.height), w: Math.round(r.width), fit: b.scrollWidth <= b.clientWidth + 1, inRow: r.right <= row.right + 1 && r.left >= row.left - 1, x: Math.round(r.left) }; });`);
  const conv = await q(`const b = document.querySelector('${AV} [data-trk][data-kind=audio] .trk-actbtn, ${AV} [data-trk][data-kind=audio] [data-convbtn]'); return b ? Math.round(b.getBoundingClientRect().left) : null;`);
  check("แถวซับมีปุ่มดูซับที่มีคำ บรรทัดเดียว ไม่ล้นแถว (BUGS 98)", sb.length > 0 && sb.every((x) => x.t === "ดูซับ" && x.fit && x.inRow && x.h <= 34), JSON.stringify({ sb, conv }));
  await c.shot(`${OUT}/21-ปุ่มดูซับ.png`, `${AV} .trk-table, ${AV} [data-trk-table]`, 6).catch(() => c.shot(`${OUT}/21-ปุ่มดูซับ.png`, `${AV} [data-trk][data-kind=subtitle]`, 40));

  // ---------- 100 หน้าต่างดูซับสูงคงที่ ----------
  await c.click(`${AV} [data-subview]`);
  await waitFor("return !!document.querySelector('[data-sub-table], [data-bigsub]');", 15000);
  await sleep(800);
  const dlgH = () => q("const d = [...document.querySelectorAll('[role=dialog]')].pop(); const r = d.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.height)];");
  const hs = {};
  for (const [v, label] of [["aeg", "แบบ Aegisub"], ["long", "แบบอ่านยาว"], ["pad", "แบบ notepad"]]) {
    await q(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.innerText.trim() === ${JSON.stringify(label)})?.click();`);
    await sleep(700);
    hs[v] = await dlgH();
    await c.shot(`${OUT}/22-ดูซับ-${v}.png`, "[role=dialog]", 0);
  }
  check("หน้าต่างดูซับสูงเท่ากันและอยู่ที่เดิมทั้งสามแบบการดู (BUGS 100)", new Set(Object.values(hs).map((x) => x.join(","))).size === 1 && hs.aeg[1] <= 720, JSON.stringify(hs));
  await c.key("Escape"); await sleep(400);

  // ---------- 99 ดูและแก้บท ----------
  const note0 = await q(`return document.querySelector('${AV} [data-chapnote]')?.innerText.trim();`);
  const ob = await q(`const b = document.querySelector('${AV} [data-chapopen]'); if (!b) return null; const r = b.getBoundingClientRect(), n = document.querySelector('${AV} [data-chapnote]').getBoundingClientRect(); return { t: b.innerText.trim(), h: Math.round(r.height), fit: b.scrollWidth <= b.clientWidth + 1, sameRow: Math.abs((r.top + r.bottom) / 2 - (n.top + n.bottom) / 2) < 4 };`);
  check("แถวบทมีคำบอกสถานะกับปุ่มดูและแก้บท แถวเดียวกัน (BUGS 99)", ob && ob.t === "ดูและแก้ Chapter" && ob.fit && ob.sameRow && !!note0, JSON.stringify({ ob, note0 }));
  const rr = await q(`const b = document.querySelector('${AV} [data-chapopen]'); const row = b.closest('[data-trk], .trk, .trow') ?? b.parentElement; const r = row.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round);`);
  await c.shotRect(`${OUT}/23-แถวบท.png`, rr[0] - 6, rr[1] - 6, rr[2] + 12, rr[3] + 12);
  await c.click(`${AV} [data-chapopen]`);
  await waitFor("return document.querySelectorAll('[data-chaprow]').length > 0;", 10000);
  await sleep(400);
  const rows0 = await q("return [...document.querySelectorAll('[data-chaprow]')].map((r) => [r.querySelector('[data-chaptime]').value, r.querySelector('input:not([data-chaptime])').value]);");
  check("หน้าต่างบทอ่านบทเดิมของไฟล์ขึ้นครบ", rows0.length >= 2 && rows0.every(([t]) => /^\d+:\d\d:\d\d/.test(t)), JSON.stringify(rows0));
  const dh0 = await dlgH();
  const hh = await q("return [...document.querySelectorAll('[data-chaprow]')].map((r) => [r.querySelector('[data-chaptime]'), r.querySelector('.inp')].map((x) => Math.round(x.getBoundingClientRect().height)).join('/'));");
  check("ช่องเวลากับช่องชื่อบทแถวเดียวกันสูงเท่ากัน", hh.every((x) => x.split('/')[0] === x.split('/')[1]), JSON.stringify(hh));
  await c.shot(`${OUT}/24-หน้าต่างบท-เดิม.png`, "[role=dialog]", 0);
  // เวลาผิด เตือนใต้แถวและปุ่มเสร็จสิ้นกดไม่ได้
  await q("const i = document.querySelector('[data-chaprow=\"1\"] [data-chaptime]'); i.focus(); i.select();");
  await c.type("9:99:99");
  await sleep(300);
  const bad = await q("return { err: document.querySelector('[data-chaprow=\"1\"] .chaperr')?.innerText.trim(), dis: document.querySelector('[data-chap-save]').getAttribute('aria-disabled'), why: document.querySelector('[data-chap-save]').title };");
  check("พิมพ์เวลาผิด เตือนใต้แถว ปุ่มเสร็จสิ้นกดไม่ได้พร้อมบอกเหตุผล", !!bad.err && bad.dis === "true" && bad.why.length > 0, JSON.stringify(bad));
  await c.shot(`${OUT}/25-หน้าต่างบท-เวลาผิด.png`, "[role=dialog]", 0);
  await q(`const i = document.querySelector('[data-chaprow="1"] [data-chaptime]'); i.focus(); i.select();`);
  await c.type(rows0[1][0]);
  await q("const i = document.querySelector('[data-chaprow=\"0\"] input:not([data-chaptime])'); i.focus(); i.select();");
  await c.type("เปิดเรื่อง");
  await c.click("[data-chapadd]"); await sleep(300);
  const nRows = await q("return document.querySelectorAll('[data-chaprow]').length;");
  const newT = await q("const r = [...document.querySelectorAll('[data-chaprow]')].pop(); return { t: r.querySelector('[data-chaptime]').value, err: !!r.querySelector('.chaperr') };");
  check("บทที่เพิ่มได้เวลาวินาทีเต็มก่อนท้ายหนัง ไม่ขึ้นเตือน", /^\d\d:\d\d:\d\d$/.test(newT.t) && !newT.err, JSON.stringify(newT));
  const dh1 = await dlgH();
  check("เพิ่มบทได้ หน้าต่างสูงเท่าเดิม", nRows === rows0.length + 1 && dh1.join() === dh0.join(), JSON.stringify({ nRows, dh0, dh1 }));
  await c.shot(`${OUT}/26-หน้าต่างบท-แก้แล้ว.png`, "[role=dialog]", 0);
  await c.click("[data-chap-save]"); await sleep(400);
  const note1 = await q(`return document.querySelector('${AV} [data-chapnote]')?.innerText.trim();`);
  check("กดเสร็จสิ้นแล้วแถวบทบอกว่าแก้แล้วกี่บท จะลงไฟล์ใหม่ตอนรวม", note1 === `แก้ Chapter แล้ว ${rows0.length + 1} อัน จะลงไฟล์ใหม่ตอนรวม`, note1);
  { const rr = await q(`const b = document.querySelector('${AV} [data-chapopen]'); const row = b.closest('[data-trk], .trk, .trow') ?? b.parentElement; const r = row.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map(Math.round);`);
  await c.shotRect(`${OUT}/27-แถวบท-แก้แล้ว.png`, rr[0] - 6, rr[1] - 6, rr[2] + 12, rr[3] + 12); }
  // เปิดอีกครั้งเห็นบทที่แก้ · กลับเป็นบทเดิมแล้วเสร็จสิ้น = เลิกแก้
  await c.click(`${AV} [data-chapopen]`);
  await waitFor("return document.querySelectorAll('[data-chaprow]').length > 0;", 6000);
  const again = await q("return document.querySelector('[data-chaprow=\"0\"] input:not([data-chaptime])').value;");
  check("เปิดซ้ำเห็นบทที่แก้ไว้", again === "เปิดเรื่อง", again);
  await c.click("[data-chap-reset]"); await sleep(200);
  await c.click("[data-chap-save]"); await sleep(400);
  const note2 = await q(`return document.querySelector('${AV} [data-chapnote]')?.innerText.trim();`);
  check("กลับเป็นบทเดิมแล้วเสร็จสิ้น แถวบทกลับเป็นคำเดิม ไม่นับว่าแก้", note2 === note0, note2);
} finally {
  rmSync(XDIR, { recursive: true, force: true });
  await q("delete window.__openDry;").catch(() => null);
  await q("document.querySelectorAll('[role=dialog]').length && document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));").catch(() => null);
  if (tpBefore) await q(`window.__setTrackPanel(${JSON.stringify(tpBefore)}, false);`).catch(() => null);
  await nav("ชั้นวางหนัง").catch(() => null);
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => null);
}
const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass} จาก ${results.length} ข้อ · ภาพอยู่ ${OUT}`);
process.exit(pass === results.length ? 0 : 1);
