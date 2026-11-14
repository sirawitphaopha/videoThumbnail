// หน้าแก้ซับ ขั้น 8 ปุ่มซ่อนภาพและเสียง กับแบบ notepad แก้ได้ (แผนหน้าแก้ซับ · BUGS ข้อ 109) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-subpad.mjs
// ① ซ่อนภาพหนังกับคลื่นเสียงแล้วตารางสูงขึ้น หน้าไม่เลื่อน จำไว้หลังโหลดใหม่ · ② notepad ข้อความตรงไฟล์ แก้แล้วตารางตรง รหัสบรรทัดเดิมคงอยู่
// ทุกการแก้รอบเดียวเป็นขั้นเลิกทำเดียว · บรรทัดเวลาผิดรูปแบบไม่หาย · รายการปัญหากดแล้วไปบรรทัดนั้นและภาพไปเวลานั้น · Ctrl+Z ในช่องเป็นของช่อง
// ไม่เขียนไฟล์ · ภาพลง docs/report-2026-11-14/แก้ซับ-ขั้น8/
import { mkdirSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const MOVIE = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv";
const SHOT = "docs/report-2026-11-14/แก้ซับ-ขั้น8";
mkdirSync(SHOT, { recursive: true });

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click();`);
const S = "window.__subEdit";
const tab = (name) => q(`const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${JSON.stringify(name)}); b?.click(); return !!b;`);
const snapDoc = () => q(`const d = ${S}.get().doc; return JSON.stringify(d.events.map((e) => [e.id, e.start, e.end, e.style, e.text]));`);
const renderRaw = () => q(`return await window.__TAURI_INTERNALS__.invoke('subdoc_render', { doc: ${S}.get().doc });`);
// ช่องพิมพ์ของหน้าเว็บเก็บตัวจบบรรทัดเป็น LF เสมอ เทียบกับไฟล์ที่จะบันทึกหลังแปลง CRLF เป็น LF
const render = async () => (await renderRaw()).replace(/\r\n?/g, "\n");
const setPad = (v) => q(`const el = document.querySelector('[data-pad-text]'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
const padVal = () => q("return document.querySelector('[data-pad-text]').value;");
const page = () => q("const pw = document.querySelector('.pagewrap'); return { over: pw.scrollHeight - pw.clientHeight, overX: pw.scrollWidth - pw.clientWidth };");
const open = async () => {
  await nav("ซับไตเติล"); await sleep(300);
  await q("window.__subClear(); window.__subOpen(" + JSON.stringify(MOVIE) + "); return 1;");
  await waitFor("return !!document.querySelector('[data-se-cmds]') && !!window.__vidLib.rate()", 20000);
  await sleep(700);
};

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  await q(`try { localStorage.setItem('se-aud', JSON.stringify({ link: false, volume: 0 })); localStorage.setItem('se-vauto', '0'); localStorage.setItem('se-fold', '0'); } catch {} return 1;`);
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  await open();
  const ORIG = await snapDoc();
  const EOL0 = await q(`return ${S}.get().doc.eol;`);
  const E0 = await q(`return ${S}.get().doc.events.map((e) => ({ id: e.id, start: e.start, text: e.text, comment: e.comment }));`);
  const at = (ms) => E0.findIndex((e) => e.start === ms && !e.comment);
  const A = at(500), B = at(4100), G = at(16100);

  // ================================================================ ① ซ่อนภาพและเสียง
  const g0 = await q("return document.querySelector('[data-sub-table]').clientHeight;");
  check("ปุ่มซ่อนภาพและเสียงอยู่แถบเครื่องมือ", await q("return document.querySelector('[data-se-fold]')?.innerText.trim() === 'ซ่อนภาพและเสียง';"));
  await q("document.querySelector('[data-se-fold]').click(); return 1;"); await sleep(500);
  const f1 = await q(`const t = document.querySelector('[data-sub-table]'); return { top: !!document.querySelector('.se-top'), h: t.clientHeight, all: t.scrollHeight <= t.clientHeight + 1, label: document.querySelector('[data-se-fold]').innerText.trim(), pressed: document.querySelector('[data-se-fold]').getAttribute('aria-pressed') };`);
  const p1 = await page();
  check(`กดแล้วภาพหนังกับคลื่นเสียงหาย ตารางสูง ${g0} เป็น ${f1.h} จุด เห็นครบทั้ง 7 บรรทัด หน้าไม่เลื่อน`, !f1.top && f1.h >= g0 + 180 && f1.all && p1.over <= 0 && p1.overX <= 0, JSON.stringify({ g0, ...f1, ...p1 }));
  check("ปุ่มเปลี่ยนเป็น แสดงภาพและเสียง บอกว่ากดอยู่", f1.label === "แสดงภาพและเสียง" && f1.pressed === "true");
  await c.shot(`${SHOT}/1-ซ่อนภาพและเสียง-1280x800.png`);
  // คีย์ลัดที่ไม่ต้องใช้ภาพยังใช้ได้ Ctrl+3 ใช้เฟรมของหนังที่ยังอ่านไว้
  await q(`window.__vidLib.seek(120); const e = ${S}.get().doc.events; ${S}.select([e[${B}].id], e[${B}].id); document.querySelector('[data-sub-table]').focus(); return 1;`);
  await waitFor("return window.__vidLib.get().pos === 120", 5000);
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "3", code: "Digit3", modifiers: 2, windowsVirtualKeyCode: 51 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "3", code: "Digit3", modifiers: 2, windowsVirtualKeyCode: 51 });
  await sleep(250);
  check("ซ่อนอยู่ คีย์ลัด Ctrl+3 ยังใช้ได้ (เวลาเริ่มไปเฟรม 120)", (await q(`return ${S}.get().doc.events[${B}].start;`)) === 4980);
  await q(`${S}.undo(); return 1;`); await sleep(150);
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  await open();
  check("โหลดหน้าใหม่ ยังซ่อนอยู่ (จำไว้ในเครื่อง)", await q("return !document.querySelector('.se-top') && document.querySelector('[data-se-fold]').getAttribute('aria-pressed') === 'true';"));
  await q("document.querySelector('[data-se-fold]').click(); return 1;"); await sleep(500);
  check("กดอีกครั้ง ภาพหนังกับคลื่นเสียงกลับมา ตารางเท่าเดิม", await q(`return !!document.querySelector('.se-top') && document.querySelector('[data-sub-table]').clientHeight === ${g0};`));

  // ================================================================ ② notepad
  check("สลับไปแบบ notepad", (await tab("แบบ notepad")) && await waitFor("return !!document.querySelector('[data-pad-text]')", 5000));
  await sleep(400);
  const t0 = await padVal();
  check("ข้อความในช่องตรงกับไฟล์ที่จะบันทึกทุกตัวอักษร", t0 === (await render()), `${t0.length} ตัว`);
  const lay = await q(`const b = document.querySelector('[data-notepad-view]').getBoundingClientRect(); const pw = document.querySelector('.pagewrap'); return { h: Math.round(b.height), bottom: Math.round(b.bottom), vh: innerHeight, over: pw.scrollHeight - pw.clientHeight, probs: document.querySelector('[data-pad-probs]').innerText.trim() };`);
  // ขอบล่างกรอบห่างขอบล่างหน้าต่างไม่เกิน 40 จุด (ขอบล่างของการ์ดกับของหน้า) ไม่ใช่ค้างที่ความสูงตั้งต้น 420
  check("กรอบ notepad สูงเต็มที่ว่าง หน้าไม่เลื่อน ไม่มีปัญหาในไฟล์ทดสอบ", lay.h >= 400 && lay.bottom >= lay.vh - 40 && lay.bottom <= lay.vh && lay.over <= 0 && lay.probs.startsWith("ไม่มีเวลาผิดรูปแบบ"), JSON.stringify(lay));
  await c.shot(`${SHOT}/2-notepad-1280x800.png`);
  const u0 = await q(`return ${S}.get().undo.length;`);
  await setPad(t0.replace("สวัสดีค่ะ", "สวัสดีครับ"));
  await sleep(900);
  let ev = await q(`return ${S}.get().doc.events.map((e) => ({ id: e.id, text: e.text }));`);
  const lab = await q(`return ${S}.get().undo.at(-1)?.label;`);
  const idBad = ev.map((x, i) => (x.id === E0[i]?.id ? null : [i, E0[i]?.id, x.id])).filter(Boolean);
  check("แก้ข้อความในช่อง พักครู่หนึ่ง เอกสารเปลี่ยนตาม รหัสบรรทัดทุกบรรทัดคงเดิม", ev[A].text === "สวัสดีครับ นี่คือฉากแรก" && idBad.length === 0 && ev.length === E0.length && lab === "แก้ในแบบ notepad", JSON.stringify({ a: ev[A], idBad, lab }));
  // ตัวจบบรรทัดของไฟล์คงเดิมหลังแก้ในแบบ notepad (ช่องพิมพ์ของหน้าเว็บแปลงเป็น LF เอง)
  const eol1 = await q(`return ${S}.get().doc.eol;`), raw1 = await renderRaw();
  const lone = (raw1.match(/[^\r]\n/g) ?? []).length;
  check(`ตัวจบบรรทัดของไฟล์คงเดิมหลังแก้ (${JSON.stringify(EOL0)})`, eol1 === EOL0 && (EOL0 !== "\r\n" || lone === 0), JSON.stringify({ eol1, lone }));
  await sleep(1800);
  await setPad((await padVal()).replace("ฉากสุดท้าย", "ฉากจบ"));
  await sleep(900);
  ev = await q(`return ${S}.get().doc.events.map((e) => e.text);`);
  check("แก้อีกครั้งหลังพักเกินสองวินาที ยังเป็นขั้นเลิกทำเดียวกัน", ev[G].startsWith("ฉากจบ") && (await q(`return ${S}.get().undo.length;`)) === u0 + 1);
  // เวลาผิดรูปแบบ
  const t1 = await padVal();
  const lines = t1.split(/\r\n|\r|\n/);
  const rowA = lines.findIndex((l) => l.includes("สวัสดีครับ"));
  await setPad(t1.replace("0:00:00.50,0:00:03.40", "0:00:0x.50,0:00:03.40"));
  await sleep(1000);
  const bad = await q(`return { n: ${S}.get().doc.events.length, bad: ${S}.get().doc.bad, probs: [...document.querySelectorAll('[data-pad-prob]')].map((b) => b.dataset.padProb + ':' + b.dataset.line) };`);
  // ASS อ่านเวลาแบบ Aegisub ข้ามตัวที่ไม่ใช่ตัวเลข 0:00:0x.50 อ่านได้ 0:00:00.50 บรรทัดยังอยู่ในตาราง รายการปัญหาบอกเวลาที่อ่านได้
  const badMsg = await q(`return [...document.querySelectorAll('[data-pad-prob="time"]')].map((b) => b.innerText.replace(/\\s+/g, ' ').trim()).join(' | ');`);
  check(`เวลาผิดรูปแบบ รายการปัญหาบอกบรรทัด ${rowA + 1} พร้อมเวลาที่อ่านได้ บรรทัดยังอยู่ในตาราง (7 บรรทัด)`, bad.n === 7 && bad.bad === 0 && bad.probs.includes(`time:${rowA + 1}`) && badMsg.includes("อ่านได้เป็น 0:00:00.50 ถึง 0:00:03.40"), JSON.stringify({ ...bad, badMsg }));
  check("บรรทัดเวลาผิดยังอยู่ในไฟล์ตอนบันทึก ไม่หาย", (await render()).includes("0:00:0x.50,0:00:03.40"));
  await c.shot(`${SHOT}/3-notepad-ปัญหา.png`, "[data-notepad-view]", 4);
  // เวลาซ้อน กดแล้วไปบรรทัดนั้น ภาพไปเวลาเริ่ม
  await setPad((await padVal()).replace("0:00:0x.50,0:00:03.40", "0:00:00.50,0:00:03.40").replace("0:00:04.10,0:00:07.20", "0:00:03.00,0:00:07.20"));
  await sleep(1000);
  const ov = await q("const b = [...document.querySelectorAll('[data-pad-prob]')].find((x) => x.dataset.padProb === 'overlap'); return b ? Number(b.dataset.line) : null;");
  check("ย้ายเวลาเริ่มให้ซ้อนบรรทัดก่อน รายการปัญหาบอกเวลาซ้อน", ov != null, String(ov));
  if (ov != null) {
    await q(`[...document.querySelectorAll('[data-pad-prob]')].find((x) => x.dataset.padProb === 'overlap').click(); return 1;`); await sleep(500);
    const cur = await q("const t = document.querySelector('[data-pad-text]'); return { row: t.value.slice(0, t.selectionStart).split(/\\r\\n|\\r|\\n/).length, pos: window.__vidLib.get().pos, want: window.__vidLib.rate().frameAt(3000, 'start') };");
    check("กดปัญหาแล้วเคอร์เซอร์ไปบรรทัดนั้น ภาพหนังไปเวลาเริ่มของบรรทัดนั้น", cur.row === ov && cur.pos === cur.want, JSON.stringify(cur));
  }
  // Ctrl+Z ในช่องเป็นเลิกทำของช่องพิมพ์
  const uBefore = await q(`return ${S}.get().undo.length;`);
  await q("document.querySelector('[data-pad-text]').focus(); return 1;");
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "z", code: "KeyZ", modifiers: 2, windowsVirtualKeyCode: 90 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", modifiers: 2, windowsVirtualKeyCode: 90 });
  await sleep(300);
  check("Ctrl+Z ในช่อง notepad ไม่เลิกทำทั้งเอกสาร", (await q(`return ${S}.get().undo.length;`)) === uBefore);
  // พิมพ์แล้วสลับแบบทันที ไม่รอ ที่พิมพ์ไม่หาย
  await setPad((await padVal()).replace("ร้องเพลง", "ร้องเพลงดัง"));
  await tab("แบบ Aegisub"); await sleep(800);
  ev = await q(`return ${S}.get().doc.events.map((e) => e.text);`);
  check("พิมพ์แล้วสลับไปแบบ Aegisub ทันที ที่พิมพ์ค้างใส่ลงเอกสาร ตารางแสดงข้อความใหม่", ev.some((x) => x.startsWith("ร้องเพลงดัง")) && (await q("return document.querySelector('[data-sub-table]').innerText.includes('ร้องเพลงดัง');")));
  check("ทุกการแก้ในแบบ notepad รอบนี้เป็นขั้นเลิกทำเดียว", (await q(`return ${S}.get().undo.length;`)) === u0 + 1);
  await q(`${S}.undo(); return 1;`); await sleep(200);
  check("เลิกทำครั้งเดียว เอกสารกลับเหมือนตอนเปิด", (await snapDoc()) === ORIG);
  // กลับเข้า notepad หลังเลิกทำ ข้อความเป็นของเอกสารปัจจุบัน
  await tab("แบบ notepad"); await waitFor("return !!document.querySelector('[data-pad-text]')", 5000); await sleep(400);
  check("กลับเข้า notepad ข้อความตรงเอกสารหลังเลิกทำ", (await padVal()) === (await render()));
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1032, deviceScaleFactor: 1, mobile: false }); await sleep(800);
  const lay2 = await q(`const b = document.querySelector('[data-notepad-view]').getBoundingClientRect(); const pw = document.querySelector('.pagewrap'); return { h: Math.round(b.height), bottom: Math.round(b.bottom), vh: innerHeight, over: pw.scrollHeight - pw.clientHeight };`);
  check("หน้าต่าง 1920 × 1032 กรอบ notepad ขยายตาม หน้าไม่เลื่อน", lay2.h > lay.h && lay2.bottom >= lay2.vh - 40 && lay2.bottom <= lay2.vh && lay2.over <= 0, JSON.stringify(lay2));
  await c.shot(`${SHOT}/4-notepad-1920x1032.png`);
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await sleep(500);
  await tab("แบบ Aegisub"); await sleep(400);
} finally {
  await q(`try { localStorage.setItem('se-vauto', '1'); localStorage.setItem('se-fold', '0'); } catch {} return 1;`).catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  c.close();
}
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length} ข้อ`);
process.exit(ok === results.length ? 0 : 1);
