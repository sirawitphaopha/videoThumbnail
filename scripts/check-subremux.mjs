// หน้าแก้ซับ ขั้น 9 ใส่ซับกลับเข้าหนัง (แผนหน้าแก้ซับ · BUGS ข้อ 109) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-subremux.mjs
// ลอกหนังทดสอบไป D:\dev\tmp\ชั้นแก้ซับใส่กลับ แก้บรรทัดหนึ่ง กด Ctrl+S ถามสองทาง เลือกใส่กลับเข้าหนัง รวมไฟล์จริง
// ไฟล์ใหม่ แทร็กครบ 4 แทร็ก ลำดับ ภาษา ชื่อ ธงหลักเหมือนเดิม ซับที่แก้อ่านกลับตรงทุกบรรทัด ซับอีกแทร็กเหมือนเดิมทุกบรรทัด ไฟล์เดิมย้ายไปที่เก็บไฟล์เดิม
// ทางผิดพลาด (window.__remuxDry) แจ้งในแถบผลค้างไว้ · ปุ่มบันทึกเป็นไฟล์ข้างหนังเปิดหน้าต่างบันทึกเป็นไฟล์ใหม่ · ลบโฟลเดอร์ทดสอบตอนจบ
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const SRC = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv";
const DIR = "D:/dev/tmp/ชั้นแก้ซับใส่กลับ";
const MOVIE = `${DIR}/ฉากตัด (2025).mkv`;
const SHOT = "docs/report-2026-11-14/แก้ซับ-ขั้น9";
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
mkdirSync(SHOT, { recursive: true });
copyFileSync(SRC, MOVIE);
const size0 = statSync(MOVIE).size;

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click();`);
const S = "window.__subEdit";
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)});`);
const lines = (d) => d.events.map((e) => [e.comment, e.layer, e.start, e.end, e.style, e.actor, e.text]);
const ctrlS = async () => {
  await q("document.querySelector('[data-sub-table]').focus(); return 1;");
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "s", code: "KeyS", modifiers: 2, windowsVirtualKeyCode: 83 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "s", code: "KeyS", modifiers: 2, windowsVirtualKeyCode: 83 });
  await sleep(300);
};

let res = null;
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  await q(`try { localStorage.setItem('se-aud', JSON.stringify({ link: false, volume: 0 })); localStorage.setItem('se-vauto', '0'); } catch {} return 1;`);
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  await nav("ซับไตเติล"); await sleep(300);
  await q("window.__subClear(); window.__subOpen(" + JSON.stringify(MOVIE) + "); return 1;");
  check("เปิดสำเนาหนังทดสอบ", await waitFor("return !!document.querySelector('[data-se-cmds]')", 20000));
  await sleep(700);
  const before = await inv("merge_inspect", { path: MOVIE });
  const subs0 = before.tracks.filter((t) => t.kind === "subtitle");
  const srt0 = await inv("subdoc_open", { path: MOVIE, inMovie: true, tid: subs0[1].tid, ff: subs0[1].ff ?? subs0[1].tid, charset: null });
  check("หนังทดสอบมี 4 แทร็ก ภาพ เสียง ซับ ASS ซับ SRT", before.tracks.length === 4 && subs0.length === 2, JSON.stringify(before.tracks.map((t) => [t.kind, t.codec, t.lang, t.name])));
  // แก้บรรทัด 0.50
  await q(`const e = ${S}.get().doc.events.find((x) => x.start === 500 && !x.comment); ${S}.updateEvent(e.id, { text: "ใส่กลับเข้าหนังแล้ว" }, "ทดสอบ"); ${S}.select([e.id], e.id); return 1;`);
  await sleep(200);
  const edited = await q(`return ${S}.get().doc;`);

  // ---------- ทางผิดพลาด ----------
  await q("window.__remuxDry = true; return 1;");
  await ctrlS();
  check("Ctrl+S ซับในหนัง ขึ้นหน้าต่างถามสองทาง", await waitFor("return !!document.querySelector('[data-remux]')", 4000));
  check("หน้าต่างบอกหนัง แทร็กที่จะถูกแทนเป็นภาษาคน กับไฟล์ใหม่เป็น MKV ชื่อเดิม", await waitFor("return /^แทร็กที่ \\d+ ครบทุกช่อง ภาษาไทย แบบ ASS$/.test(document.querySelector('[data-remux-track]')?.innerText ?? '') && document.querySelector('[data-remux-out]').innerText === 'MKV ชื่อเดิม' && document.querySelector('[data-remux-movie]').innerText === 'ฉากตัด (2025).mkv'", 8000),
    await q("return (document.querySelector('[data-remux-track]')?.innerText ?? '') + ' / ' + document.querySelector('[data-remux-out]')?.innerText;"));
  check("เปิดแล้วโฟกัสอยู่ปุ่มบันทึกเป็นไฟล์ข้างหนัง ไม่ใช่ปุ่ม ⓘ", await q("return document.activeElement?.hasAttribute('data-remux-file') ?? false;"), await q("return document.activeElement?.outerHTML.slice(0, 80) ?? '';"));
  await sleep(400);
  await q("const ds = [...document.querySelectorAll('.dlg')]; ds[ds.length - 1].setAttribute('data-shotdlg', '1'); return 1;");
  await c.shot(`${SHOT}/1-ถามสองทาง.png`, "[data-shotdlg]", 4);
  const fit = await q("const d = document.querySelector('[data-shotdlg]'); const over = [...d.querySelectorAll('.se-drow, .se-dlbl')].filter((x) => x.scrollWidth > x.clientWidth + 1).length; const r = d.getBoundingClientRect(); return { over, inWin: r.right <= innerWidth && r.bottom <= innerHeight };");
  check("หน้าต่างไม่มีแถวล้น อยู่ในหน้าต่างโปรแกรม", fit.over === 0 && fit.inWin, JSON.stringify(fit));
  await q("document.querySelector('[data-remux-go]').click(); return 1;");
  check("รวมไม่สำเร็จ แจ้งในแถบผลค้างไว้ ไฟล์หนังไม่ถูกแตะ", await waitFor("return (document.querySelector('[data-se-saveerr]')?.innerText ?? '').includes('ทดสอบ ไม่รวมไฟล์จริง')", 4000) && statSync(MOVIE).size === size0);
  await q("delete window.__remuxDry; [...document.querySelectorAll('[data-se-saveerr] button')].find((b) => b.innerText === 'ปิด')?.click(); return 1;");
  // ---------- บันทึกเป็นไฟล์ข้างหนัง ----------
  await ctrlS(); await waitFor("return !!document.querySelector('[data-remux-file]')", 4000);
  await q("document.querySelector('[data-remux-file]').click(); return 1;");
  check("ปุ่มบันทึกเป็นไฟล์ข้างหนัง เปิดหน้าต่างบันทึกเป็นไฟล์ใหม่ ที่เก็บข้างหนังนามสกุล .ass", await waitFor("return (document.querySelector('[data-se-saveas-path]')?.innerText ?? '').endsWith('.ass')", 4000));
  await q("[...document.querySelectorAll('.dlg .btn-ghost')].find((b) => b.innerText === 'ยกเลิก')?.click(); return 1;"); await sleep(300);

  // ---------- ใส่กลับเข้าหนังจริง ----------
  await ctrlS(); await waitFor("return !!document.querySelector('[data-remux-go]:not([aria-disabled])')", 8000);
  await q("const b = [...document.querySelectorAll('[data-remux] .seg button')].find((x) => x.innerText.trim() === 'เก็บไว้ในโฟลเดอร์ไฟล์เดิม'); b.click(); return 1;"); await sleep(150);
  await q("document.querySelector('[data-remux-go]').click(); return 1;");
  const prog = await waitFor("return !!document.querySelector('[data-remux-prog]')", 3000);
  check("กดใส่กลับเข้าหนัง ขึ้นแถบความคืบหน้า", prog);
  check("รวมเสร็จ หน้าต่างปิด แถบผลบอกว่าใส่ซับกลับเข้าหนังแล้ว", await waitFor("return !document.querySelector('[data-remux]') && (document.querySelector('[data-se-state]')?.innerText ?? '').includes('ใส่ซับกลับเข้าหนังแล้ว')", 120000),
    await q("return document.querySelector('[data-se-state]')?.innerText ?? '';"));
  res = await q("return window.__lastRemux ?? null;");
  check("ไฟล์ใหม่ชื่อเดิม ตรวจผ่าน ซับที่แก้อ่านกลับตรงทุกบรรทัด", res && res.output.replace(/\\/g, "/").endsWith("ฉากตัด (2025).mkv") && res.verified && res.same === true, JSON.stringify(res && { output: res.output, verified: res.verified, same: res.same, original: res.original }));
  check("ไฟล์เดิมย้ายไปที่เก็บไฟล์เดิม ไม่ลบ", res && res.original === "kept" && res.originalTo && existsSync(res.originalTo) && statSync(res.originalTo).size === size0, res?.originalTo ?? "");
  check("ไม่แก้แล้ว สถานะไม่มีงานค้าง", await q(`return ${S}.get().dirty === false;`));
  const after = await inv("merge_inspect", { path: MOVIE });
  const subs1 = after.tracks.filter((t) => t.kind === "subtitle");
  check("ไฟล์ใหม่ 4 แทร็ก ชนิด ลำดับ ภาษา ชื่อ ธงหลัก เหมือนเดิม", JSON.stringify(after.tracks.map((t) => [t.kind, t.lang, t.name, t.default])) === JSON.stringify(before.tracks.map((t) => [t.kind, t.lang, t.name, t.default])),
    JSON.stringify(after.tracks.map((t) => [t.kind, t.codec, t.lang, t.name, t.default])));
  check("ภาพกับเสียง codec เดิม ไม่แปลง", after.tracks[0].codec === before.tracks[0].codec && after.tracks[1].codec === before.tracks[1].codec && Math.abs((after.duration ?? 0) - (before.duration ?? 0)) < 0.1);
  const ass1 = await inv("subdoc_open", { path: MOVIE, inMovie: true, tid: subs1[0].tid, ff: subs1[0].ff ?? subs1[0].tid, charset: null });
  const srt1 = await inv("subdoc_open", { path: MOVIE, inMovie: true, tid: subs1[1].tid, ff: subs1[1].ff ?? subs1[1].tid, charset: null });
  check("ซับ ASS ในไฟล์ใหม่ตรงกับที่แก้ทุกบรรทัด มีบรรทัดที่แก้", JSON.stringify(lines(ass1)) === JSON.stringify(lines(edited)) && ass1.events.some((e) => e.text === "ใส่กลับเข้าหนังแล้ว"));
  check("ซับ SRT อีกแทร็กเหมือนเดิมทุกบรรทัด", JSON.stringify(lines(srt1)) === JSON.stringify(lines(srt0)));
  check("สไตล์ของซับ ASS ในไฟล์ใหม่ครบ 3 สไตล์", ass1.styles.length === 3, String(ass1.styles.length));
} finally {
  await q(`try { delete window.__remuxDry; window.__subClear(); localStorage.setItem('se-vauto', '1'); } catch {} return 1;`).catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  c.close();
  await sleep(500);
  try { rmSync(DIR, { recursive: true, force: true }); } catch { /* ไฟล์ยังถูกเปิดอยู่ ลบรอบหน้า */ }
  // ที่เก็บไฟล์เดิมตั้งไว้นอกโฟลเดอร์ทดสอบได้ (หน้าตั้งค่า) ลบเฉพาะไฟล์ที่ตัวตรวจย้ายไป
  try { if (res?.originalTo && existsSync(res.originalTo)) rmSync(res.originalTo, { force: true }); } catch { /* ลบไม่ได้ */ }
}
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length} ข้อ`);
process.exit(ok === results.length ? 0 : 1);
