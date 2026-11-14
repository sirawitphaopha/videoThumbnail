// ตัวตรวจรอบแก้ผลผู้ช่วยตรวจทานระบบซับ (docs/review/ตรวจทาน-2026-11-14/) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-review-fixes.mjs
// ทำงานกับสำเนาไฟล์ทดสอบใน D:\dev\tmp\ชั้นตรวจทานซับ เท่านั้น · บันทึกทับส่งสำเนาเดิมลงถังขยะจริงแบบตัวตรวจหน้าแก้ซับ · ลบโฟลเดอร์ตอนจบ
// F1 Enter ในช่องพิมพ์ยืนยันเวลาที่ลากก่อนไปบรรทัดถัดไป · F2 บรรทัดใหม่เริ่มที่เวลาจบที่เพิ่งยืนยัน · F3 เลิกทำหลังบันทึกไม่ย้อนที่มาของไฟล์
// F4 แก้ระหว่างรอบันทึกยังนับว่ายังไม่บันทึก · F5 notepad กดบันทึกตอนกำลังแปลงกลับ ที่พิมพ์ไม่หาย · F6 เปิดซับสองอันติดกัน ผลที่มาช้าไม่ทับ
// F18 ซับในหนังจำเลขแทร็กในที่มา ฉบับที่ไม่รู้แทร็กใส่กลับเข้าหนังไม่ได้
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const SRC = "D:/movie-shelf/test-media/สร้าง/แก้ซับ";
const TMP = "D:/dev/tmp/ชั้นตรวจทานซับ";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
copyFileSync(`${SRC}/ฉากตัด (2025).th.ass`, `${TMP}/a.ass`);
copyFileSync(`${SRC}/ยาว 2000 บรรทัด.th.srt`, `${TMP}/long.srt`);
const A = `${TMP}/a.ass`, B = `${TMP}/b.ass`, LONG = `${TMP}/long.srt`, MKV = `${SRC}/ฉากตัด (2025).mkv`;

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(100); } return false; };
const S = "window.__subEdit";
const tab = (name) => q(`const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === ${JSON.stringify(name)}); b?.click(); return !!b;`);
const open = async (p) => {
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(p)}); return 1;`);
  return waitFor(`return !!document.querySelector('[data-se-cmds]') && ${S}.get().doc?.source?.path?.replace(/\\\\/g, '/').endsWith(${JSON.stringify(p.split("/").pop())});`, 20000);
};
const enter = async (sel) => {
  await q(`document.querySelector(${JSON.stringify(sel)}).focus(); return 1;`);
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
};
/** กดบันทึกแล้วรอจนเสร็จ · คืนว่ามีหน้าต่างไฟล์ถูกแก้จากที่อื่นขึ้นไหม */
const saveNow = async () => {
  await q("document.querySelector('[data-se-save]').click(); return 1;");
  await sleep(150);
  await waitFor("return !document.querySelector('[data-se-save]').innerText.includes('กำลัง');", 10000);
  await sleep(200);
  return q("return [...document.querySelectorAll('.dlg')].some((d) => d.innerText.includes('ไฟล์ซับถูกแก้จากที่อื่น'));");
};
const closeDlgs = () => q("[...document.querySelectorAll('.dlg .btn-ghost')].filter((b) => b.innerText.trim() === 'ยกเลิก').forEach((b) => b.click()); return 1;");

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  await q(`try { localStorage.setItem('se-fold', '0'); localStorage.setItem('se-aud', JSON.stringify({ link: false, volume: 0 })); } catch {} return 1;`);
  // โหลดหน้าใหม่ทั้งหน้า โมดูลที่แก้แล้วเปลี่ยนแบบสด (HMR) ค้างสองชุดได้ หน้าแก้ซับเรียก flushPad ของชุดเก่า ผลตรวจ F5 เพี้ยน
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  await q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === 'ซับไตเติล')?.click(); return 1;`);
  await sleep(300);
  await tab("แบบ Aegisub");

  // F1 กด Enter ในช่องพิมพ์ เวลาที่ลากไว้ลงบรรทัดก่อนไปบรรทัดถัดไป
  check("เปิดสำเนา a.ass", await open(A));
  await q(`window.__subTiming.setOpt('autoCommit', false); const e = ${S}.get().doc.events.find((x) => x.start === 500 && !x.comment); window.__f1 = e.id; ${S}.select([e.id], e.id); return 1;`);
  await sleep(300);
  await q(`window.__subTiming.setPend({ id: window.__f1, start: 700, end: 3600, links: [] }); return 1;`);
  await enter("[data-se-text]");
  await sleep(300);
  const f1 = await q(`const e = ${S}.get().doc.events.find((x) => x.id === window.__f1); return { start: e.start, end: e.end, active: ${S}.get().active, pend: window.__subTiming.get().pend };`);
  check("F1 กด Enter ในช่องพิมพ์ เวลาที่ลากไว้ลงบรรทัดแล้วจึงไปบรรทัดถัดไป", f1.start === 700 && f1.end === 3600 && f1.active !== (await q("return window.__f1;")) && !f1.pend, JSON.stringify(f1));

  // F2 บรรทัดสุดท้าย ลากเวลาจบออกไปแล้วกด Enter บรรทัดใหม่เริ่มที่เวลาจบใหม่
  await q(`const ev = ${S}.get().doc.events; const e = ev[ev.length - 1]; window.__f2 = { id: e.id, n: ev.length, end: e.end + 2200 }; ${S}.select([e.id], e.id); return 1;`);
  await sleep(300);
  await q(`const e = ${S}.get().doc.events.find((x) => x.id === window.__f2.id); window.__subTiming.setPend({ id: e.id, start: e.start, end: window.__f2.end, links: [] }); return 1;`);
  await enter("[data-se-text]");
  await sleep(300);
  const f2 = await q(`const ev = ${S}.get().doc.events; const nw = ev[ev.length - 1]; const old = ev.find((x) => x.id === window.__f2.id); return { want: window.__f2.end, oldEnd: old.end, newStart: nw.start, n: ev.length, n0: window.__f2.n };`);
  check("F2 บรรทัดสุดท้ายกด Enter บรรทัดใหม่เริ่มที่เวลาจบที่เพิ่งยืนยัน", f2.n === f2.n0 + 1 && f2.oldEnd === f2.want && f2.newStart === f2.want, JSON.stringify(f2));
  await q("window.__subTiming.setOpt('autoCommit', false); return 1;");

  // F3 ① บันทึก แก้ เลิกทำข้ามจุดบันทึก แล้วบันทึกอีกครั้ง ต้องไม่เตือนว่าไฟล์ถูกแก้จากที่อื่น
  check("F3 เปิดสำเนา a.ass ใหม่", await open(A));
  await q(`const e = ${S}.get().doc.events.find((x) => x.start === 500 && !x.comment); ${S}.updateEvent(e.id, { text: e.text + ' แก้หนึ่ง' }, 'ตัวตรวจ'); return 1;`);
  const askedA = await saveNow();
  check("F3 บันทึกครั้งแรกสำเร็จ", !askedA && (await q(`return !${S}.get().dirty;`)) && readFileSync(A, "utf8").includes("แก้หนึ่ง"));
  await q(`${S}.undo(); return 1;`);
  const asked2 = await saveNow();
  await closeDlgs();
  check("F3 เลิกทำข้ามจุดบันทึกแล้วบันทึกอีกครั้ง ไม่ขึ้นหน้าต่างไฟล์ถูกแก้จากที่อื่น และไฟล์ได้ฉบับที่เลิกทำ", !asked2 && !readFileSync(A, "utf8").includes("แก้หนึ่ง") && (await q(`return !${S}.get().dirty;`)), `ขึ้นหน้าต่าง ${asked2}`);

  // F3 ② แก้ บันทึกเป็นไฟล์ใหม่ b.ass เลิกทำข้ามจุดบันทึก แก้ต่อ กดบันทึก ต้องเขียน b.ass ไม่ทับ a.ass
  check("F3 เปิดสำเนา a.ass อีกรอบ", await open(A));
  const aBefore = readFileSync(A);
  await q(`const e = ${S}.get().doc.events.find((x) => x.start === 500 && !x.comment); ${S}.updateEvent(e.id, { text: e.text + ' ก่อนแยกไฟล์' }, 'ตัวตรวจ'); return 1;`);
  await q(`window.__subSaveAs = ${JSON.stringify(B)}; document.querySelector('[data-se-saveas]').click(); return 1;`);
  await waitFor("return !!document.querySelector('[data-se-saveas-dlg]')", 4000);
  await q("document.querySelector('[data-se-saveas-browse]').click(); return 1;");
  await waitFor(`return (document.querySelector('[data-se-saveas-path]')?.innerText ?? '').endsWith('b.ass');`, 4000);
  await q("document.querySelector('[data-se-saveas-ok]').click(); return 1;");
  await waitFor("return !document.querySelector('[data-se-saveas-dlg]');", 8000);
  await sleep(400);
  check("F3 บันทึกเป็นไฟล์ใหม่ b.ass แล้ว", existsSync(B) && (await q(`return ${S}.get().doc.source.path.replace(/\\\\/g, '/').endsWith('b.ass');`)));
  await q(`${S}.undo(); const e = ${S}.get().doc.events.find((x) => x.start === 500 && !x.comment); ${S}.updateEvent(e.id, { text: e.text + ' หลังเลิกทำ' }, 'ตัวตรวจ'); return 1;`);
  const asked3 = await saveNow();
  await closeDlgs();
  const aAfter = readFileSync(A), bText = readFileSync(B, "utf8");
  check("F3 เลิกทำหลังบันทึกเป็นไฟล์ใหม่แล้วกดบันทึก เขียน b.ass ไม่ทับ a.ass", !asked3 && aAfter.equals(aBefore) && bText.includes("หลังเลิกทำ"), `a เท่าเดิม ${aAfter.equals(aBefore)} · b มีคำใหม่ ${bText.includes("หลังเลิกทำ")} · ที่มา ${await q(`return ${S}.get().doc.source.path;`)}`);

  // F4 แก้ระหว่างรอบันทึก การแก้นั้นยังนับว่ายังไม่บันทึก และไม่อยู่ในไฟล์
  check("F4 เปิด b.ass", await open(B));
  await q(`const e = ${S}.get().doc.events.find((x) => x.start === 500 && !x.comment); ${S}.updateEvent(e.id, { text: e.text + ' ก่อนกดบันทึก' }, 'ตัวตรวจ'); return 1;`);
  await q(`const b = document.querySelector('[data-se-save]'); b.click();
    await new Promise((r) => { const t0 = Date.now(); const t = setInterval(() => { if (b.innerText.includes('กำลัง') || Date.now() - t0 > 2000) { clearInterval(t); r(); } }, 1); });
    const e = ${S}.get().doc.events.find((x) => x.start === 500 && !x.comment); ${S}.updateEvent(e.id, { text: e.text + ' ระหว่างรอ' }, 'ตัวตรวจ'); return 1;`);
  await waitFor("return !document.querySelector('[data-se-save]').innerText.includes('กำลัง');", 10000);
  await sleep(300);
  const f4 = await q(`return { dirty: ${S}.get().dirty, text: ${S}.get().doc.events.find((x) => x.start === 500 && !x.comment).text };`);
  const bNow = readFileSync(B, "utf8");
  check("F4 แก้ระหว่างรอบันทึก ยังนับว่ายังไม่บันทึก ไฟล์มีแค่ฉบับตอนกด", f4.dirty && f4.text.includes("ระหว่างรอ") && bNow.includes("ก่อนกดบันทึก") && !bNow.includes("ระหว่างรอ"), JSON.stringify({ dirty: f4.dirty }));

  // F5 notepad ไฟล์ 2,000 บรรทัด พิมพ์ รอให้เริ่มแปลงกลับ แล้วกดบันทึกทันที ที่พิมพ์ต้องลงไฟล์และยังอยู่บนจอ
  check("F5 เปิดสำเนา long.srt", await open(LONG));
  await tab("แบบ notepad");
  await waitFor("return !!document.querySelector('[data-pad-text]') && document.querySelector('[data-pad-text]').value.length > 1000", 8000);
  await sleep(300);
  // พิมพ์แล้วรอ 505 ms ในหน้าเว็บเอง ตัวจับเวลา 500 ms ของ notepad เริ่มแปลงกลับไปแล้ว กำลังรอฝั่ง Rust อยู่ แล้วกดบันทึกทันที
  // (รอจากตัวตรวจข้ามโปรเซสคลาดหลายสิบมิลลิวินาที แปลงกลับเสร็จก่อนกด ตัวตรวจจึงเขียวทั้งที่โค้ดเก่ายังพัง)
  await q(`const el = document.querySelector('[data-pad-text]'); const v = el.value.replace(/(\\n\\n|\\r\\n\\r\\n)/, ' พิมพ์ในโน้ตแพด$1'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 505)); document.querySelector('[data-se-save]').click(); return 1;`);
  await sleep(200);
  await waitFor("return !document.querySelector('[data-se-save]').innerText.includes('กำลัง');", 15000);
  await sleep(1200);
  const longText = readFileSync(LONG, "utf8");
  const f5 = await q(`return { pad: document.querySelector('[data-pad-text]').value.includes('พิมพ์ในโน้ตแพด'), dirty: ${S}.get().dirty, doc: ${S}.get().doc.events.some((e) => e.text.includes('พิมพ์ในโน้ตแพด')) };`);
  check("F5 กดบันทึกตอนกำลังแปลงกลับ ที่พิมพ์ลงไฟล์ อยู่ในเอกสาร และยังอยู่ในช่องพิมพ์", longText.includes("พิมพ์ในโน้ตแพด") && f5.pad && f5.doc && !f5.dirty, JSON.stringify({ ...f5, file: longText.includes("พิมพ์ในโน้ตแพด") }));
  await tab("แบบ Aegisub");

  // F6 หนังมีซับสองแทร็ก (ASS ครบทุกช่อง กับ SRT แท็ก SRT) กดแทร็กที่ 2 แล้วรีบกดกลับแทร็กที่ 1 · แทร็กที่ 2 ถอดเสร็จทีหลังต้องไม่ทับ
  // และกดแทร็กที่ 2 แล้วกดแทร็กที่ 1 ตอนเอกสารของแทร็กที่ 1 ไม่อยู่แล้ว (เปิดใหม่ทั้งคู่) ผลของอันที่กดก่อนต้องไม่ทับอันล่าสุด
  check("F6 เปิดหนังที่มีซับสองแทร็ก", await open(MKV));
  const pick = (i) => q(`document.querySelectorAll('[data-sub-list] .subpage-trkpick')[${i}].click(); return 1;`);
  const tidOn = () => q(`return { tid: ${S}.get().doc?.source?.tid ?? null, sel: [...document.querySelectorAll('[data-sub-list] .subpage-trkpick')].findIndex((b) => b.getAttribute('aria-pressed') === 'true') };`);
  const t1 = (await tidOn()).tid;
  await pick(1); await sleep(40); await pick(0);
  await sleep(6000);
  const f6a = await tidOn();
  check("F6 กดแทร็กที่ 2 แล้วรีบกดกลับแทร็กที่ 1 เอกสารยังเป็นของแทร็กที่ 1", f6a.sel === 0 && f6a.tid === t1, JSON.stringify({ ...f6a, ควรเป็น: t1 }));
  await pick(1);
  await waitFor(`return ${S}.get().doc?.source?.tid !== ${t1};`, 15000);
  const t2 = (await tidOn()).tid;
  // ตอนนี้เอกสารเป็นของแทร็กที่ 2 · กดแทร็กที่ 1 (ต้องถอดใหม่) แล้วรีบกดแทร็กที่ 2 (ใช้เอกสารเดิมไม่ได้แล้ว เพราะกดแทร็กที่ 1 เริ่มเปิดใหม่)
  await pick(0); await sleep(40); await pick(1);
  await sleep(6000);
  const f6b = await tidOn();
  check("F6 กดสลับแทร็กเร็ว ๆ อีกทาง เอกสารตรงกับแทร็กที่เลือกอยู่", f6b.sel === 1 && f6b.tid === t2, JSON.stringify({ ...f6b, ควรเป็น: t2 }));

  // F18 ซับในหนังจำเลขแทร็กในที่มา · ฉบับที่ไม่รู้แทร็ก หน้าต่างใส่กลับเข้าหนังกดไม่ได้พร้อมเหตุผล
  check("F18 เปิดซับในหนัง", await open(MKV));
  const tid = await q(`return ${S}.get().doc.source.tid ?? null;`);
  check("F18 ที่มาของซับในหนังมีเลขแทร็ก", typeof tid === "number", String(tid));
  await q("window.__remuxDry = true; document.querySelector('[data-se-save]').click(); return 1;");
  await waitFor("return !!document.querySelector('[data-remux]') && !!document.querySelector('[data-remux-track]');", 10000);
  check("F18 หน้าต่างใส่กลับเข้าหนังบอกแทร็กตามที่มาของเอกสาร", await q(`return document.querySelector('[data-remux-track]').innerText.includes('แทร็กที่ ' + ${tid});`), await q("return document.querySelector('[data-remux-track]')?.innerText ?? '';"));
  await closeDlgs();
  await sleep(300);
  await q(`const s = ${S}.get(); ${S}.openDoc({ ...s.doc, source: { ...s.doc.source, tid: null } }, s.meta); return 1;`);
  await sleep(300);
  await q("document.querySelector('[data-se-save]').click(); return 1;");
  await waitFor("return !!document.querySelector('[data-remux]');", 5000);
  await sleep(300);
  const f18 = await q("const g = document.querySelector('[data-remux-go]'); return { off: g.getAttribute('aria-disabled') === 'true', why: g.title, msg: document.querySelector('[data-remux]').innerText.includes('ไม่รู้ว่ามาจากแทร็กไหน') };");
  check("F18 ฉบับที่ไม่รู้ว่ามาจากแทร็กไหน ปุ่มใส่กลับเข้าหนังกดไม่ได้พร้อมเหตุผล", f18.off && f18.why.includes("ไม่รู้ว่ามาจากแทร็กไหน") && f18.msg, JSON.stringify(f18));
  await closeDlgs();

  // ---------------------------------------------------------------- ข้อปานกลางและข้อเล็ก
  // F12 ไฟล์เสียงแยกของซับหนึ่ง ไม่ติดไปกับซับอื่น
  await q(`window.__subTiming.setOwnAudio({ path: 'D:/x.m4a', map: '0:a:0', idx: 0, name: 'x.m4a', own: true }); return 1;`);
  check("F12 เปิด b.ass หลังตั้งไฟล์เสียงแยกไว้กับหนัง", await open(B));
  check("F12 เปิดซับอื่นแล้วไฟล์เสียงแยกของซับเดิมไม่ติดมา", await q("return window.__subTiming.get().own === null;"));
  // F14 เวลาที่ลากค้าง ทิ้งตอนเลิกทำและตอนเปิดเอกสารใหม่
  await q(`const e = ${S}.get().doc.events.find((x) => !x.comment); ${S}.select([e.id], e.id); window.__subTiming.setPend({ id: e.id, start: 100, end: 200, links: [] }); ${S}.updateEvent(e.id, { text: e.text + ' x' }, 'ตัวตรวจ'); ${S}.undo(); return 1;`);
  check("F14 เลิกทำแล้วเวลาที่ลากค้างถูกทิ้ง", await q("return window.__subTiming.get().pend === null;"));
  // F13 บรรทัดที่ลากตามด้วย Ctrl ข้ามขอบอีกฝั่ง ยืนยันแล้วเวลาเริ่มยังก่อนเวลาจบ
  await q(`const ev = ${S}.get().doc.events.filter((x) => !x.comment); const a = ev[0], b = ev[1]; window.__f13 = b.id; ${S}.select([a.id], a.id); window.__subTiming.setPend({ id: a.id, start: a.start, end: b.end + 500, links: [{ id: b.id, start: b.end + 500, end: b.end }] }); return 1;`);
  await q("document.querySelector('[data-se-ab=commit]').click(); return 1;");
  await sleep(300);
  const f13 = await q(`const b = ${S}.get().doc.events.find((x) => x.id === window.__f13); return { start: b.start, end: b.end };`);
  check("F13 บรรทัดที่ลากตามข้ามขอบ ยืนยันแล้วเวลาเริ่มไม่เลยเวลาจบ", f13.start <= f13.end, JSON.stringify(f13));
  // F21 ปุ่มบรรทัดก่อนที่บรรทัดแรก กดไม่ได้พร้อมเหตุผล · Ctrl คลิกบรรทัดเดียวที่เลือกไม่เอาออก
  await q(`const e = ${S}.get().doc.events[0]; ${S}.select([e.id], e.id); return 1;`);
  await sleep(200);
  check("F21 บรรทัดแรก ปุ่มบรรทัดก่อนกดไม่ได้และบอกเหตุผล", await q("const b = document.querySelector('[data-se-prev]'); return b.getAttribute('aria-disabled') === 'true' && b.title.includes('บรรทัดแรก');"));
  const firstId = await q(`return ${S}.get().doc.events[0].id;`);
  await c.click(`[data-sub-table] tr[data-id="${firstId}"]`, { modifiers: 2 }).catch(() => {});
  await q(`const r = document.querySelector('[data-sub-table] tr[data-id="${firstId}"]'); const o = r.getBoundingClientRect(); r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: true, clientX: o.left + 5, clientY: o.top + 5 })); return 1;`);
  await sleep(200);
  check("F21 Ctrl คลิกบรรทัดเดียวที่เลือกอยู่ ไม่เอาออก", await q(`return ${S}.get().sel.length === 1;`));
  // F19 Shift กับลูกศรลงสามครั้ง เลือกได้สี่บรรทัดจากจุดเริ่ม
  await q("document.querySelector('[data-sub-table]').focus(); return 1;");
  for (let i = 0; i < 3; i++) {
    await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowDown", code: "ArrowDown", modifiers: 8, windowsVirtualKeyCode: 40 });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowDown", code: "ArrowDown", modifiers: 8, windowsVirtualKeyCode: 40 });
    await sleep(80);
  }
  const f19 = await q(`const s = ${S}.get(); const ids = s.doc.events.slice(0, 4).map((e) => e.id); return { n: s.sel.length, ok: ids.every((x) => s.sel.includes(x)) };`);
  check("F19 Shift กับลูกศรลงสามครั้ง เลือกสี่บรรทัดตั้งแต่จุดเริ่ม", f19.n === 4 && f19.ok, JSON.stringify(f19));
  // F20 ลากในกล่องสี (เหตุการณ์ input หลายครั้ง) ไม่ใส่แท็ก · เลือกสีเสร็จ (change) ใส่แท็กครั้งเดียว เลิกทำขั้นเดียว
  await q(`const e = ${S}.get().doc.events.find((x) => !x.comment && !x.text.includes('{')); ${S}.select([e.id], e.id); window.__f20 = e.id; return 1;`);
  await sleep(300);
  const u0 = await q(`return ${S}.get().undo.length;`);
  await q("const el = document.querySelector('.se-colorpick'); for (const v of ['#ff0000', '#00ff00', '#0000ff']) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } return 1;");
  await sleep(200);
  const mid = await q(`return ${S}.get().doc.events.find((x) => x.id === window.__f20).text;`);
  await q("const el = document.querySelector('.se-colorpick'); el.dispatchEvent(new Event('change', { bubbles: true })); return 1;");
  await sleep(300);
  const f20 = await q(`const t = ${S}.get().doc.events.find((x) => x.id === window.__f20).text; return { t, tags: (t.match(/\\\\[1-4]?c&H/g) || []).length, steps: ${S}.get().undo.length - ${u0} };`);
  check("F20 ลากในกล่องสีไม่ใส่แท็ก เลือกเสร็จใส่แท็กสีชั้นเดียว เลิกทำขั้นเดียว", !mid.includes("{") && f20.tags === 1 && f20.steps === 1, JSON.stringify(f20));
  // F24 Ctrl+S ตอนยังไม่แก้ ไม่เขียนไฟล์ใหม่
  check("F24 เปิด b.ass ใหม่", await open(B));
  const mt0 = (await import("node:fs")).statSync(B).mtimeMs;
  await q("document.querySelector('[data-sub-table]').focus(); return 1;");
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "s", code: "KeyS", modifiers: 2, windowsVirtualKeyCode: 83 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "s", code: "KeyS", modifiers: 2, windowsVirtualKeyCode: 83 });
  await sleep(1200);
  check("F24 Ctrl+S ตอนยังไม่แก้ ไม่เขียนไฟล์ใหม่ ไฟล์เดิมไม่ลงถังขยะ", (await import("node:fs")).statSync(B).mtimeMs === mt0);
  // F16 แก้ในแบบ notepad ตัวเดียว นับว่าแก้หนึ่งบรรทัด ไม่ใช่ทุกบรรทัด
  check("F16 เปิดสำเนา long.srt", await open(LONG));
  await tab("แบบ notepad");
  await waitFor("return !!document.querySelector('[data-pad-text]') && document.querySelector('[data-pad-text]').value.length > 1000", 8000);
  await sleep(300);
  await q(`const el = document.querySelector('[data-pad-text]'); const v = el.value.replace(/(\\n\\n|\\r\\n\\r\\n)/, ' แก้ตัวเดียว$1'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
  await sleep(1500);
  await tab("แบบ Aegisub");
  await sleep(500);
  const f16 = await q(`return { n: ${S}.editedCount(), total: ${S}.get().doc.events.length };`);
  check("F16 แก้ในแบบ notepad ตัวเดียว นับว่าแก้หนึ่งบรรทัด", f16.n === 1, JSON.stringify(f16));
  // F10 เล่นเสียงยาว ก้อนเสียงที่ดังจบแล้วถูกปล่อย ไม่สะสม
  check("F10 เปิดซับในหนัง", await open(MKV));
  await q(`try { window.__subTiming.setOpt('volume', 1); } catch {} const e = ${S}.get().doc.events.find((x) => !x.comment); ${S}.select([e.id], e.id); return 1;`);
  await sleep(500);
  await c.click("[data-se-ab=toend]").catch(() => {});
  await sleep(10000);
  const f10 = await q("return window.__audioNow();");
  await c.click("[data-se-ab=stop]").catch(() => {});
  check("F10 เล่นจนจบไฟล์ 10 วินาที ก้อนเสียงค้างไม่เกิน 2 ก้อน (ก้อนละ 4 วินาที ที่ดังจบแล้วต้องไม่ค้าง)", f10.nodes <= 2, JSON.stringify(f10));
} finally {
  await q(`try { delete window.__subSaveAs; delete window.__remuxDry; window.__subClear?.(); } catch {} return 1;`).catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  c.close();
  rmSync(TMP, { recursive: true, force: true });
}
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length} ข้อ`);
process.exit(ok === results.length ? 0 : 1);
