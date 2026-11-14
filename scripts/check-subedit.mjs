// หน้าแก้ซับ (แผนหน้าแก้ซับ · BUGS ข้อ 109) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-subedit.mjs
// ขั้น 2 store เลิกทำทำซ้ำ พิมพ์ต่อเนื่องนับขั้นเดียว สลับหน้าแล้วไม่หาย บันทึกอัตโนมัติแล้วเปิดคืน หน้าต่างถามตอนปิดโปรแกรม บันทึกทับจริง
// ขั้น 3 หน้าแก้ซับบนจอ เปิดซับในหนังกับไฟล์ ASS SRT พิมพ์ แก้เวลา แท็ก ฟอนต์ แทรก แยก รวม ลบ เลือกหลายแถว บันทึก ไฟล์ถูกแก้จากที่อื่น บันทึกเป็น SRT ชื่อชน เปลี่ยนเป็น ASS ถามก่อนเปลี่ยนแทร็ก 2,000 บรรทัด ขนาดจอ
// ทำงานกับสำเนาไฟล์ทดสอบใน D:\dev\tmp\ชั้นแก้ซับ เท่านั้น · บันทึกทับส่งสำเนาเดิมลงถังขยะจริง · กดปุ่มปิดจริงแต่ตั้ง __closeDry ไม่ให้ปิด
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const SRC = "D:/movie-shelf/test-media/สร้าง/แก้ซับ";
const TMP = "D:/dev/tmp/ชั้นแก้ซับ";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync("docs/report-2026-11-13/แก้ซับ-ขั้น2", { recursive: true });
for (const f of ["ฉากตัด (2025).th.ass", "ฉากตัด (2025).tis620.th.srt"]) copyFileSync(`${SRC}/${f}`, `${TMP}/${f}`);
const ASS = `${TMP}/ฉากตัด (2025).th.ass`;
const TIS = `${TMP}/ฉากตัด (2025).tis620.th.srt`;

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click();`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)});`);
const S = "window.__subEdit";
/** เรียกคำสั่งแล้วดักข้อผิดพลาดในหน้า · ผิดพลาดได้ข้อความขึ้นต้น ERR: */
const invE = (cmd, args) => q(`try { return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}); } catch (e) { return "ERR:" + e; }`);

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  check("store ของหน้าแก้ซับโหลดแล้ว", await waitFor(`return !!${S}`));
  // เริ่มจากหน้าซับไตเติลว่าง ไม่มีหน้าแก้ซับลงทะเบียนตัวบันทึก (ข้อบันทึกแล้วปิดของขั้น 2)
  await nav("ซับไตเติล"); await sleep(300);
  await q("window.__subClear?.(); return 1;"); await sleep(200);
  // ---------- เปิด แก้ เลิกทำ ทำซ้ำ ----------
  const doc = await inv("subdoc_open", { path: ASS, inMovie: false, tid: 0, ff: 0, charset: null });
  check("เปิด ASS ครบทุกช่อง 3 สไตล์ 7 บรรทัด เข้ารหัสกลับได้ไบต์เดิม", doc.styles.length === 3 && doc.events.length === 7 && doc.exact && doc.kind === "ass", `${doc.styles.length} ${doc.events.length} ${doc.exact}`);
  await q(`${S}.openDoc(${JSON.stringify(doc)}, { name: "ฉากตัด (2025).th.ass", movie: "" }); return 1;`);
  const st0 = await q(`const s = ${S}.get(); return { dirty: s.dirty, active: s.active, undo: s.undo.length };`);
  check("เปิดแล้วยังไม่แก้ เลือกบรรทัดแรก", !st0.dirty && st0.active === doc.events[0].id && st0.undo === 0, JSON.stringify(st0));
  const id1 = doc.events[1].id;
  await q(`${S}.updateEvent(${id1}, { text: "พิมพ์ครั้งที่หนึ่ง" }, "แก้ข้อความ", "text:${id1}"); ${S}.updateEvent(${id1}, { text: "พิมพ์ครั้งที่สอง" }, "แก้ข้อความ", "text:${id1}"); return 1;`);
  const st1 = await q(`const s = ${S}.get(); return { dirty: s.dirty, undo: s.undo.length, text: s.doc.events[1].text, n: ${S}.editedCount(), label: s.undo.at(-1)?.label };`);
  check("พิมพ์ต่อเนื่องในช่องเดียวกันนับเป็นการแก้ขั้นเดียว แก้แล้ว 1 บรรทัด", st1.dirty && st1.undo === 1 && st1.text === "พิมพ์ครั้งที่สอง" && st1.n === 1 && st1.label === "แก้ข้อความ", JSON.stringify(st1));
  await q(`${S}.updateEvent(${id1}, { start: 4500 }, "เลื่อนเวลาเริ่ม"); return 1;`);
  await q(`${S}.undo(); return 1;`);
  const st2 = await q(`const s = ${S}.get(); return { start: s.doc.events[1].start, text: s.doc.events[1].text, redo: s.redo.length };`);
  check("เลิกทำครั้งแรกย้อนเวลาเริ่ม ข้อความยังเป็นที่พิมพ์", st2.start === doc.events[1].start && st2.text === "พิมพ์ครั้งที่สอง" && st2.redo === 1, JSON.stringify(st2));
  await q(`${S}.undo(); return 1;`);
  const st3 = await q(`const s = ${S}.get(); return { text: s.doc.events[1].text, dirty: s.dirty, same: s.doc === s.saved };`);
  check("เลิกทำจนสุด กลับเป็นเอกสารตอนเปิด ไม่นับว่ายังไม่บันทึก", st3.text === doc.events[1].text && !st3.dirty && st3.same, JSON.stringify(st3));
  await q(`${S}.redo(); ${S}.redo(); return 1;`);
  const st4 = await q(`const s = ${S}.get(); return { text: s.doc.events[1].text, start: s.doc.events[1].start, dirty: s.dirty };`);
  check("ทำซ้ำสองครั้งได้ทั้งข้อความและเวลากลับมา", st4.text === "พิมพ์ครั้งที่สอง" && st4.start === 4500 && st4.dirty, JSON.stringify(st4));
  // ลบแล้วเลือกบรรทัดที่ตำแหน่งเดิม · แทรกแล้วเลือกบรรทัดใหม่
  await q(`${S}.deleteEvents([${id1}], "ลบบรรทัด"); return 1;`);
  const st5 = await q(`const s = ${S}.get(); return { n: s.doc.events.length, active: s.active, want: s.doc.events[1].id };`);
  check("ลบบรรทัดแล้วเลือกบรรทัดที่อยู่ตำแหน่งเดิม", st5.n === 6 && st5.active === st5.want, JSON.stringify(st5));
  await q(`const d = ${S}.get().doc; ${S}.insertEvent(0, ${S}.blankEvent(d, { start: 3500, end: 4000, text: "บรรทัดใหม่" }), "แทรกบรรทัด"); return 1;`);
  const st6 = await q(`const s = ${S}.get(); const e = s.doc.events[1]; return { n: s.doc.events.length, text: e.text, active: s.active === e.id, style: e.style };`);
  check("แทรกบรรทัดใหม่หลังบรรทัดแรก เลือกบรรทัดใหม่ ใช้สไตล์แรกของไฟล์", st6.n === 7 && st6.text === "บรรทัดใหม่" && st6.active && st6.style === "Default", JSON.stringify(st6));

  // ---------- สลับหน้าแล้วไม่หาย ----------
  await nav("ชั้นวางหนัง"); await sleep(400); await nav("ซับไตเติล"); await sleep(400);
  check("สลับหน้าไปกลับ เอกสารที่แก้ยังอยู่", await q(`const s = ${S}.get(); return s.doc.events.length === 7 && s.dirty && s.undo.length === 4;`));

  // ---------- บันทึกอัตโนมัติ ----------
  const auto = await q(`return await ${S}.autosaveNow();`);
  check("บันทึกอัตโนมัติได้ไฟล์ในโฟลเดอร์ autosave ของโปรแกรม", !!auto && /autosave/.test(auto.path) && auto.events === 7, auto?.path);
  const again = await q(`return await ${S}.autosaveNow();`);
  check("ไม่ได้แก้เพิ่ม ไม่บันทึกอัตโนมัติซ้ำ", again === null);
  const list = await inv("subdoc_autosaves", {});
  check("รายการฉบับบันทึกอัตโนมัติมีฉบับนี้อยู่บนสุด", list[0]?.path === auto?.path && list[0].name === "ฉากตัด (2025).th.ass");
  const back = await inv("subdoc_open_autosave", { path: auto.path });
  check("เปิดฉบับบันทึกอัตโนมัติ ได้ข้อความที่แก้ ที่มาเป็นไฟล์เดิม", back.events[1].text === "บรรทัดใหม่" && back.source?.path === ASS && !back.source.inMovie, back.source?.path);

  // ---------- หน้าต่างถามตอนปิดโปรแกรม ----------
  await c.click(".titlebar .ctl button.close");
  check("กดปิดตอนซับยังไม่บันทึก ขึ้นหน้าต่างถาม โปรแกรมไม่ปิด", await waitFor("return !!document.querySelector('[data-closesub]')", 4000));
  check("หน้าต่างถามบอกชื่อไฟล์ มี 3 ปุ่ม บอกว่าเปิดฉบับอัตโนมัติคืนได้", await q("const d = document.querySelector('[data-closesub]').closest('.dlg'), t = d.textContent; return t.includes('ฉากตัด (2025).th.ass') && t.includes('ฉบับบันทึกอัตโนมัติ') && !!d.querySelector('[data-closesub-skip]') && !!d.querySelector('[data-closesub-back]') && !!d.querySelector('[data-closesub-ok]');"));
  await c.shot("docs/report-2026-11-13/แก้ซับ-ขั้น2/1-ถามตอนปิด.png", ".dlg", 12);
  await q("document.querySelector('[data-closesub-back]').click(); return 1;");
  await sleep(300);
  check("กดกลับไปดูก่อน หน้าต่างปิด อยู่หน้าซับไตเติล", await q("return !document.querySelector('[data-closesub]') && getComputedStyle(document.querySelector('[data-pageslot=subtitle]')).display !== 'none';"));
  await q("window.__closeDry = true; window.__closedDry = false; return 1;");
  await c.click(".titlebar .ctl button.close");
  await waitFor("return !!document.querySelector('[data-closesub-skip]')", 4000);
  await q("document.querySelector('[data-closesub-skip]').click(); return 1;");
  check("กดปิดโดยไม่บันทึก สั่งปิดโปรแกรม (รุ่นทดสอบจดไว้แทนการปิดจริง)", await waitFor("return window.__closedDry === true", 4000));
  // บันทึกแล้วปิด ตอนยังไม่มีหน้าแก้ซับลงทะเบียนตัวบันทึก พาไปหน้าซับไตเติล ไม่ปิด
  await q("window.__closedDry = false; return 1;");
  await nav("ชั้นวางหนัง"); await sleep(300);
  await c.click(".titlebar .ctl button.close");
  await waitFor("return !!document.querySelector('[data-closesub-ok]')", 4000);
  await q("document.querySelector('[data-closesub-ok]').click(); return 1;");
  await sleep(400);
  check("บันทึกแล้วปิดตอนยังไม่มีตัวบันทึก พาไปหน้าซับไตเติลให้บันทึกเอง ไม่ปิด", await q("return window.__closedDry === false && getComputedStyle(document.querySelector('[data-pageslot=subtitle]')).display !== 'none' && !document.querySelector('[data-closesub]');"));

  // ---------- บันทึกทับจริง ----------
  const cur = await q(`return ${S}.get().doc;`);
  const saved = await inv("subdoc_save", { doc: cur, target: ASS, mode: "replace", force: null });
  const text = readFileSync(ASS, "utf8");
  check("บันทึกทับได้ บรรทัดใหม่อยู่ในไฟล์ บรรทัดที่ไม่ได้แก้เหมือนเดิม ส่วนที่โปรแกรมไม่รู้จักอยู่ครบ", text.includes(",บรรทัดใหม่") && text.includes("Dialogue: 0,0:00:00.50,0:00:03.40,Default,ดาว,0,0,0,,สวัสดีค่ะ นี่คือฉากแรก") && text.includes("[Aegisub Extradata]") && text.includes("Unknown Key: เก็บไว้ตามเดิม") && !text.includes("ฉากที่สอง"), saved.path);
  await q(`const d = ${S}.get().doc; ${S}.markSaved(d, { source: ${JSON.stringify(saved.source)}, enc: d.enc, exact: true }); return 1;`);
  check("บันทึกแล้วไม่นับว่ายังไม่บันทึก", await q(`return ${S}.get().dirty === false;`));
  const again2 = await invE("subdoc_save", { doc: cur, target: ASS, mode: "replace", force: null });
  check("บันทึกทับด้วยที่มาเก่า (ไฟล์เปลี่ยนไปแล้ว) ตอบ changed ไม่เขียนทับ", again2 === "ERR:changed" && readFileSync(ASS, "utf8") === text, String(again2));

  // ---------- TIS-620 ----------
  const tis = await inv("subdoc_open", { path: TIS, inMovie: false, tid: 0, ff: 0, charset: null });
  check("เปิด SRT แบบ TIS-620 อ่านไทยออก รหัสเดิม", tis.enc.charset === "TIS-620" && tis.events[0].text.includes("สวัสดีค่ะ"), tis.enc.charset);
  const before = readFileSync(TIS);
  tis.events[0].text = "แก้ด้วยภาษาไทย";
  await inv("subdoc_save", { doc: tis, target: TIS, mode: "replace", force: null });
  const after = readFileSync(TIS);
  check("บันทึกกลับยังเป็น TIS-620 (ไม่มี BOM ไม่มีไบต์ UTF-8 ของไทย)", after[0] !== 0xef && !after.includes(Buffer.from("แก้", "utf8")) && after.length < before.length + 40, `${before.length} → ${after.length}`);
  // ================================================================ ขั้น 3 หน้าแก้ซับบนจอ
  await q(`${S}.closeDoc(); return 1;`);
  for (const f of ["ฉากตัด (2025).th.ass", "ฉากตัด (2025).th.srt", "ยาว 2000 บรรทัด.th.srt", "ฉากตัด (2025).mkv"]) copyFileSync(`${SRC}/${f}`, `${TMP}/${f}`);
  const MKV = `${TMP}/ฉากตัด (2025).mkv`;
  const ASS2 = ASS;
  const ED = "[data-subedit]";
  const keyDown = async (code, key, mods = 0) => {
    await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, modifiers: mods, windowsVirtualKeyCode: code.startsWith("Key") ? code.charCodeAt(3) : 0 });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers: mods });
  };
  const rows = () => q(`return [...document.querySelectorAll('${ED} [data-sub-table] tbody tr[data-id]')].map((r) => r.lastElementChild.innerText);`);
  const docNow = () => q(`return ${S}.get().doc;`);
  const setInput = (sel, v) => q(`const el = document.querySelector(${JSON.stringify(sel)}); el.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new FocusEvent('blur')); el.blur(); return 1;`);

  await nav("ซับไตเติล"); await sleep(300);
  await q("window.__subClear(); return 1;");
  await q(`window.__subOpen(${JSON.stringify(MKV)}); return 1;`);
  check("เปิดหนังที่มีซับ ASS ในตัว ขึ้นหน้าแก้ซับ ไม่ใช่ตัวดูซับ", await waitFor(`return !!document.querySelector('${ED} [data-se-edit]') && !document.querySelector('[data-subviewer-inline]')`, 15000));
  const g0 = await q(`const d = ${S}.get(); return { n: document.querySelectorAll('${ED} [data-sub-table] tbody tr[data-id]').length, kind: d.doc.kind, active: d.active, first: d.doc.events.find((e) => !e.comment).id, cmt: !!document.querySelector('${ED} tr.se-cmt .se-cmtpill') };`);
  check("ตาราง 7 บรรทัด เลือกบรรทัดแรกที่ไม่ใช่ความคิดเห็น บรรทัดความคิดเห็นมีป้าย", g0.n === 7 && g0.kind === "ass" && g0.active === g0.first && g0.cmt, JSON.stringify(g0));
  check("ซับในหนัง ปุ่มบันทึกบอกว่าต้องบันทึกเป็นไฟล์ใหม่", await q(`return document.querySelector('[data-se-save]').title.includes('บันทึกเป็นไฟล์ใหม่');`));

  // ---------- เปิดไฟล์ ASS ข้างหนัง แก้ทุกช่อง ----------
  await q("window.__subClear(); return 1;");
  await q(`window.__subOpen(${JSON.stringify(ASS2)}); return 1;`);
  await waitFor(`return !!document.querySelector('${ED} [data-se-text]')`, 10000);
  await c.shot("docs/report-2026-11-13/แก้ซับ-ขั้น3/1-หน้าแก้ซับ-1280.png");
  // พิมพ์ในช่องข้อความ
  await c.click(`${ED} [data-se-text]`);
  await q(`const t = document.querySelector('${ED} [data-se-text]'); t.setSelectionRange(t.value.length, t.value.length); return 1;`);
  await c.type(" เพิ่ม");
  await sleep(200);
  const t1 = await q(`return { box: document.querySelector('${ED} [data-se-text]').value, row: document.querySelector('${ED} tr.on').lastElementChild.innerText, state: document.querySelector('[data-se-state]').innerText };`);
  check("พิมพ์ในช่อง ตารางเปลี่ยนตามทันที บอกว่าแก้แล้ว 1 บรรทัดยังไม่บันทึก", t1.box.endsWith(" เพิ่ม") && t1.row.endsWith(" เพิ่ม") && t1.state.includes("แก้แล้ว 1 บรรทัด"), JSON.stringify(t1));
  check("แถวที่แก้มีแถบสีหน้าแถว", await q(`return document.querySelector('${ED} tr.on').classList.contains('se-edited');`));
  // Ctrl+Z ตอนแป้นเป็นภาษาไทย (key เป็นตัวไทย code ยังเป็น KeyZ)
  await keyDown("KeyZ", "ผ", 2);
  await sleep(200);
  check("Ctrl+Z ตอนแป้นเป็นไทย เลิกทำได้ ข้อความกลับเป็นเดิม", await q(`return !document.querySelector('${ED} [data-se-text]').value.includes('เพิ่ม') && ${S}.get().dirty === false;`));
  await keyDown("KeyY", "น", 2);
  await sleep(200);
  check("Ctrl+Y ทำซ้ำได้", await q(`return document.querySelector('${ED} [data-se-text]').value.endsWith(' เพิ่ม');`));
  // เวลาเริ่ม จบ ความยาว
  await setInput(`${ED} [data-se-time=start]`, "0:00:00.80");
  await sleep(150);
  const tm = await q(`const e = ${S}.get().doc.events.find((x) => x.id === ${S}.get().active); return [e.start, e.end];`);
  check("พิมพ์เวลาเริ่มแล้วเปลี่ยน เวลาจบเท่าเดิม", tm[0] === 800 && tm[1] === 3400, JSON.stringify(tm));
  await setInput(`${ED} [data-se-time=dur]`, "5");
  await sleep(150);
  const tm2 = await q(`const e = ${S}.get().doc.events.find((x) => x.id === ${S}.get().active); return [e.start, e.end];`);
  check("พิมพ์ความยาว เปลี่ยนเวลาจบอย่างเดียว (แบบ Aegisub)", tm2[0] === 800 && tm2[1] === 5800, JSON.stringify(tm2));
  await setInput(`${ED} [data-se-time=end]`, "abc");
  await sleep(150);
  check("พิมพ์เวลาผิดรูปแบบ ช่องขอบแดง ค่าไม่เปลี่ยน", await q(`const el = document.querySelector('${ED} [data-se-time=end]'); return el.classList.contains('err') && ${S}.get().doc.events.find((x) => x.id === ${S}.get().active).end === 5800;`));
  await setInput(`${ED} [data-se-time=end]`, "0:00:05.80");
  // ปุ่มตัวหนา ห่อข้อความที่เลือก
  await q(`const t = document.querySelector('${ED} [data-se-text]'); t.focus(); t.setSelectionRange(0, 5); return 1;`);
  await q(`document.querySelector('${ED} [data-se-tag=b]').click(); return 1;`);
  await sleep(150);
  check("ปุ่มตัวหนาห่อข้อความที่เลือกด้วย {\\b1} {\\b0}", await q(`return document.querySelector('${ED} [data-se-text]').value.startsWith('{\\\\b1}สวัสด{\\\\b0}');`));
  // ช่องของ ASS
  await setInput(`${ED} [data-se-actor]`, "เหนือ");
  await setInput(`${ED} [data-se-margin='2']`, "40");
  await sleep(150);
  const ff = await q(`const e = ${S}.get().doc.events.find((x) => x.id === ${S}.get().active); return [e.actor, e.marginV];`);
  check("แก้ตัวละครกับระยะขอบได้", ff[0] === "เหนือ" && ff[1] === 40, JSON.stringify(ff));
  // หน้าต่างเลือกฟอนต์
  await q(`const t = document.querySelector('${ED} [data-se-text]'); t.focus(); t.setSelectionRange(t.value.length - 5, t.value.length); return 1;`);
  await q(`document.querySelector('${ED} [data-se-fn]').click(); return 1;`);
  check("ปุ่ม fn เปิดหน้าต่างเลือกฟอนต์ รายชื่อฟอนต์ในเครื่องขึ้น", await waitFor("return document.querySelectorAll('[data-font-dialog] [data-font]').length > 10", 15000));
  await q(`const i = document.querySelector('[data-font-q]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'arial'); i.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
  await sleep(200);
  await q(`document.querySelector('[data-font="Arial"]')?.click(); const s = document.querySelector('[data-font-size]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(s, '64'); s.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
  await sleep(150);
  await sleep(400);
  await c.shot("docs/report-2026-11-13/แก้ซับ-ขั้น3/2-เลือกฟอนต์.png", ".dlg", 10);
  await q("document.querySelector('[data-font-apply]').click(); return 1;");
  await sleep(200);
  check("ใช้ฟอนต์แล้วใส่ \\fn \\fs ตรงข้อความที่เลือก พร้อมแท็กคืนค่าท้าย", await q(`const v = document.querySelector('${ED} [data-se-text]').value; return v.includes('{\\\\fnArial\\\\fs64}') && v.endsWith('{\\\\fn\\\\fs}');`));
  // แทรก แยก รวม ลบ
  const n0 = (await docNow()).events.length;
  await q(`document.querySelector('${ED} [data-se-insert]').click(); return 1;`);
  await sleep(150);
  // ยาว 3 วินาทีแต่ไม่ล้ำเวลาเริ่มของบรรทัดอื่นทุกบรรทัด รวมบรรทัดความคิดเห็น (insert_after ของ Aegisub ที่ขั้น 6 ลอกมา)
  const ins = await q(`const d = ${S}.get(); const i = d.doc.events.findIndex((e) => e.id === d.active); const s = d.doc.events[i].start; return { n: d.doc.events.length, start: s, prevEnd: d.doc.events[i - 1].end, len: d.doc.events[i].end - s, want: Math.min(3000, ...d.doc.events.filter((e) => e.id !== d.active && e.start >= s).map((e) => e.start - s)) };`);
  check("แทรกบรรทัด เริ่มที่เวลาจบของบรรทัดก่อน ยาว 3 วินาทีแต่ไม่ล้ำบรรทัดถัดไป เลือกบรรทัดใหม่", ins.n === n0 + 1 && ins.start === ins.prevEnd && ins.len === ins.want && ins.len > 0, JSON.stringify(ins));
  await q(`document.querySelector('${ED} [data-se-delete]').click(); return 1;`);
  await sleep(150);
  check("ลบบรรทัดที่แทรก จำนวนกลับเท่าเดิม", (await docNow()).events.length === n0);
  // เลือกบรรทัด "ฉากที่สอง" แล้วแยกตรงคำว่า ขึ้นบรรทัดใหม่
  await q(`const r = [...document.querySelectorAll('${ED} [data-sub-table] tbody tr[data-id]')].find((x) => x.innerText.includes('ฉากที่สอง')); r.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); return 1;`);
  await sleep(150);
  await q(`const t = document.querySelector('${ED} [data-se-text]'); t.focus(); const k = t.value.indexOf('ขึ้นบรรทัดใหม่'); t.setSelectionRange(k, k); return 1;`);
  await q(`document.querySelector('${ED} [data-se-split]').click(); return 1;`);
  await sleep(150);
  const sp = await q(`const d = ${S}.get(); const i = d.doc.events.findIndex((e) => e.id === d.active); const a = d.doc.events[i - 1], b = d.doc.events[i]; return { n: d.doc.events.length, a: a.text, b: b.text, cut: a.end === b.start, inside: a.start < a.end && b.start < b.end };`);
  check("แยกตรงเคอร์เซอร์ได้สองบรรทัด เวลาต่อกันพอดี", sp.n === n0 + 1 && sp.b === "ขึ้นบรรทัดใหม่" && !sp.a.endsWith("\\N") && sp.cut && sp.inside, JSON.stringify(sp));
  await q(`const d = ${S}.get(); const i = d.doc.events.findIndex((e) => e.id === d.active); ${S}.select([d.doc.events[i - 1].id, d.active], d.doc.events[i - 1].id); return 1;`);
  await q(`document.querySelector('${ED} [data-se-join]').click(); return 1;`);
  await sleep(150);
  const jn = await q(`const d = ${S}.get(); const e = d.doc.events.find((x) => x.id === d.active); return { n: d.doc.events.length, t: e.text };`);
  check("รวมสองบรรทัดที่เลือก ต่อข้อความด้วยเว้นวรรคแบบ Aegisub", jn.n === n0 && jn.t.endsWith(" ขึ้นบรรทัดใหม่"), JSON.stringify(jn));
  // เลือกหลายแถว Ctrl และ Shift
  await q(`const rs = [...document.querySelectorAll('${ED} [data-sub-table] tbody tr[data-id]')]; rs[1].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); rs[3].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, ctrlKey: true })); return 1;`);
  await sleep(100);
  const s1 = await q(`return ${S}.get().sel.length;`);
  await q(`const rs = [...document.querySelectorAll('${ED} [data-sub-table] tbody tr[data-id]')]; rs[5].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, shiftKey: true })); return 1;`);
  await sleep(100);
  const s2 = await q(`return ${S}.get().sel.length;`);
  check("Ctrl กับคลิกเลือกเพิ่มได้ Shift เลือกเป็นช่วง", s1 === 2 && s2 === 3, `${s1} ${s2}`);
  // แท็กในตาราง
  await q(`[...document.querySelectorAll('${ED} .se-gridbar .seg button')].find((b) => b.innerText.includes('ย่อเป็น')).click(); return 1;`);
  await sleep(100);
  check("ย่อแท็กในตารางเป็น ☀", (await rows()).some((t) => t.includes("☀")) && !(await rows()).some((t) => t.includes("{\\")));
  await q(`[...document.querySelectorAll('${ED} .se-gridbar .seg button')].find((b) => b.innerText.includes('แท็กเต็ม')).click(); return 1;`);

  // ---------- บันทึก ----------
  await keyDown("KeyS", "ห", 2);
  check("Ctrl+S ตอนแป้นเป็นไทย บันทึกทับได้ บอกว่าบันทึกแล้ว", await waitFor(`return document.querySelector('[data-se-state]').innerText.includes('บันทึกแล้ว') && ${S}.get().dirty === false`, 6000));
  const savedTxt = readFileSync(ASS2, "utf8");
  check("ในไฟล์มีที่แก้ บรรทัดที่ไม่ได้แก้เหมือนเดิม", savedTxt.includes("{\\fnArial\\fs64}") && savedTxt.includes(",เหนือ,0,0,40,,") && savedTxt.includes("Dialogue: 2,0:00:12.00,0:00:15.90,Song,,0,0,0,Banner;12;0;30,ร้องเพลง") && savedTxt.includes("[Aegisub Extradata]"));
  // ไฟล์ถูกแก้จากที่อื่น
  writeFileSync(ASS2, savedTxt.replace("ฉากสุดท้าย", "แก้จากโปรแกรมอื่น"));
  await q(`${S}.updateEvent(${S}.get().active, { effect: "x" }, "แก้เอฟเฟกต์"); return 1;`);
  await q(`document.querySelector('[data-se-save]').click(); return 1;`);
  check("ไฟล์ถูกแก้จากที่อื่นหลังเปิด ถามก่อนบันทึกทับ", await waitFor("return !!document.querySelector('[data-se-changed-force]')", 5000));
  await sleep(400);
  await c.shot("docs/report-2026-11-13/แก้ซับ-ขั้น3/3-ไฟล์ถูกแก้จากที่อื่น.png", ".dlg", 10);
  await q("document.querySelector('[data-se-changed-force]').click(); return 1;");
  check("กดบันทึกทับแล้วบันทึกได้", await waitFor(`return ${S}.get().dirty === false`, 6000) && !readFileSync(ASS2, "utf8").includes("แก้จากโปรแกรมอื่น"));
  // บันทึกเป็น SRT เตือนสิ่งที่หาย · ชื่อชนตั้งชื่อใหม่ต่อเลข
  await q(`document.querySelector('[data-se-saveas]').click(); return 1;`);
  await waitFor("return !!document.querySelector('[data-se-saveas-dlg]')", 4000);
  await q(`[...document.querySelectorAll('[data-se-saveas-dlg] .seg button')].find((b) => b.innerText === 'SRT').click(); return 1;`);
  check("เลือก SRT แล้วบอกสิ่งที่หายครบ", await waitFor("const t = document.querySelector('[data-se-lost]')?.innerText ?? ''; return t.includes('ชื่อตัวละคร') && t.includes('ลำดับชั้น') && t.includes('ความคิดเห็น') && t.includes('ระยะขอบ') && t.includes('เอฟเฟกต์') && t.includes('แท็กฟอนต์')", 5000));
  check("ที่เก็บตั้งต้นอยู่ข้างไฟล์เดิม นามสกุล .srt", await q("return document.querySelector('[data-se-saveas-path]').innerText.endsWith('ฉากตัด (2025).th.srt');"));
  await sleep(400);
  await c.shot("docs/report-2026-11-13/แก้ซับ-ขั้น3/4-บันทึกเป็น-SRT.png", ".dlg", 10);
  await q("document.querySelector('[data-se-saveas-ok]').click(); return 1;");
  check("มีไฟล์ชื่อนี้อยู่แล้ว ไม่เขียนทับ ถามตั้งชื่อใหม่", await waitFor("return !!document.querySelector('[data-se-exists-renum]')", 5000) && readFileSync(`${TMP}/ฉากตัด (2025).th.srt`, "utf8").includes("<font"));
  await q("document.querySelector('[data-se-exists-renum]').click(); return 1;");
  const s2path = `${TMP}/ฉากตัด (2025).th (2).srt`;
  check("ตั้งชื่อใหม่ต่อเลข ได้ไฟล์ SRT ใหม่ หน้าแก้เปิดไฟล์ใหม่นั้น", await waitFor(`return ${S}.get().doc?.kind === 'srt' && ${S}.get().doc.source?.path.endsWith('ฉากตัด (2025).th (2).srt')`, 8000) && existsSync(s2path) && readFileSync(s2path, "utf8").startsWith("﻿1\r\n"));
  // SRT ช่องของ ASS กดไม่ได้ เปลี่ยนเป็น ASS แล้วบันทึกเป็นไฟล์ใหม่
  check("ซับ SRT ช่องของ ASS กดไม่ได้ มีปุ่มเปลี่ยนเป็น ASS", await q(`return document.querySelector('${ED} [data-se-actor]').disabled && document.querySelector('${ED} [data-se-color="1c"]').getAttribute('aria-disabled') === 'true' && !!document.querySelector('${ED} [data-se-toass]');`));
  await q(`document.querySelector('${ED} [data-se-toass]').click(); return 1;`);
  check("เปลี่ยนเป็น ASS ในหน้านี้ ช่องของ ASS ใช้ได้ ปุ่มบันทึกพาไปบันทึกไฟล์ใหม่", await waitFor(`return ${S}.get().doc.kind === 'ass' && !document.querySelector('${ED} [data-se-actor]').disabled`, 4000));
  await q(`document.querySelector('[data-se-save]').click(); return 1;`);
  check("บันทึกหลังเปลี่ยนชนิด ขึ้นหน้าต่างบันทึกเป็นไฟล์ใหม่ .ass", await waitFor("return document.querySelector('[data-se-saveas-path]')?.innerText.endsWith('.ass')", 4000));
  await q("document.querySelector('.dlg [data-se-saveas-ok]') && [...document.querySelectorAll('.dlg .btn-ghost')].find((b) => b.innerText === 'ยกเลิก').click(); return 1;");

  // ---------- เปลี่ยนแทร็กตอนยังไม่บันทึก ----------
  await q("window.__subClear(); return 1;");
  await q(`window.__subOpen(${JSON.stringify(MKV)}); return 1;`);
  await waitFor(`return !!document.querySelector('${ED} [data-se-text]')`, 15000);
  await q(`${S}.updateEvent(${S}.get().active, { text: "แก้แล้วยังไม่บันทึก" }, "แก้ข้อความ"); return 1;`);
  await q("document.querySelector('[data-sub-pick=\"1\"]').click(); return 1;");
  check("เปลี่ยนแทร็กตอนยังไม่บันทึก ถามก่อน", await waitFor("return !!document.querySelector('[data-sub-guard-back]')", 4000));
  await sleep(400); // รอหน้าต่างค่อย ๆ ปรากฏจนเต็มก่อนถ่าย
  await c.shot("docs/report-2026-11-13/แก้ซับ-ขั้น3/5-ถามก่อนเปลี่ยนแทร็ก.png", ".dlg", 10);
  await q("document.querySelector('[data-sub-guard-back]').click(); return 1;");
  await sleep(200);
  check("กลับไปแก้ต่อ ยังเป็นแทร็กเดิม ที่แก้ยังอยู่", await q(`return ${S}.get().doc.kind === 'ass' && ${S}.get().dirty;`));
  await q("document.querySelector('[data-sub-pick=\"1\"]').click(); return 1;");
  await waitFor("return !!document.querySelector('[data-sub-guard-skip]')", 4000);
  await q("document.querySelector('[data-sub-guard-skip]').click(); return 1;");
  check("ไม่บันทึก แล้วเปลี่ยนเป็นแทร็ก SRT", await waitFor(`return ${S}.get().doc?.kind === 'srt' && !${S}.get().dirty`, 8000));

  // ---------- 2,000 บรรทัด ----------
  await q("window.__subClear(); return 1;");
  const t0 = Date.now();
  await q(`window.__subOpen(${JSON.stringify(`${TMP}/ยาว 2000 บรรทัด.th.srt`)}); return 1;`);
  await waitFor(`return ${S}.get().doc?.events.length === 2000 && !!document.querySelector('${ED} [data-se-text]')`, 15000);
  const ms = Date.now() - t0;
  const dom = await q(`return document.querySelectorAll('${ED} [data-sub-table] tbody tr[data-id]').length;`);
  check("เปิด 2,000 บรรทัด วาดแถวแค่ที่เห็นกับเผื่อ ไม่ถึง 100 แถว", dom > 0 && dom < 100, `${dom} แถว เปิดใน ${ms} ms`);
  await q(`const g = document.querySelector('${ED} [data-sub-table]'); g.scrollTop = g.scrollHeight; g.dispatchEvent(new Event('scroll')); return 1;`);
  await sleep(200);
  check("เลื่อนลงสุด แถวสุดท้ายขึ้น ความสูงตารางเท่าทุกแถวจริง", await q(`const g = document.querySelector('${ED} [data-sub-table]'); return [...g.querySelectorAll('tbody tr[data-id]')].some((r) => r.firstElementChild.innerText === '2000') && Math.abs(g.scrollHeight - (2000 * 30 + 28)) < 40;`));
  await q(`document.querySelector('${ED} [data-sub-table]').focus(); return 1;`);
  const a0 = await q(`const d = ${S}.get(); return d.doc.events.findIndex((e) => e.id === d.active);`);
  const tk = Date.now();
  for (let i = 0; i < 20; i++) await c.key("ArrowDown");
  const a1 = await q(`const d = ${S}.get(); return d.doc.events.findIndex((e) => e.id === d.active);`);
  check("ลูกศรลงในตาราง 20 ครั้ง บรรทัดที่แก้เลื่อนลง 20 บรรทัด", a1 === a0 + 20, `${a0} → ${a1} ใช้ ${Date.now() - tk} ms`);

  // ---------- ขนาดจอ ----------
  for (const [w, h] of [[1280, 800], [1600, 852]]) {
    await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    const over = await q(`const W = innerWidth; return [...document.querySelectorAll('${ED} button, ${ED} input, ${ED} .seg, ${ED} .dd')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > W - 1; }).length + [...document.querySelectorAll('${ED} .se-erow, ${ED} .se-tools')].filter((r) => r.scrollWidth > r.clientWidth + 1).length;`);
    const fit = await q(`const g = document.querySelector('${ED} [data-sub-table]').getBoundingClientRect(); return g.bottom <= innerHeight + 1 && g.height >= 80;`);
    check(`หน้าต่าง ${w} × ${h} ไม่มีปุ่มล้นขวา ตารางอยู่ในจอ`, over === 0 && fit, `ล้น ${over}`);
  }
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
} finally {
  await q(`${S}?.closeDoc(); window.__subClear?.(); delete window.__closeDry; delete window.__closedDry; return 1;`).catch(() => {});
  await nav("ชั้นวางหนัง").catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => {});
}
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length}`);
process.exit(ok === results.length ? 0 : 1);
