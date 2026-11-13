// หน้าแก้ซับ (แผนหน้าแก้ซับ · BUGS ข้อ 109) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-subedit.mjs
// ขั้น 2 store เลิกทำทำซ้ำ พิมพ์ต่อเนื่องนับขั้นเดียว สลับหน้าแล้วไม่หาย บันทึกอัตโนมัติแล้วเปิดคืน หน้าต่างถามตอนปิดโปรแกรม บันทึกทับจริง
// ทำงานกับสำเนาไฟล์ทดสอบใน D:\dev\tmp\ชั้นแก้ซับ เท่านั้น · บันทึกทับส่งสำเนาเดิมลงถังขยะจริง · กดปุ่มปิดจริงแต่ตั้ง __closeDry ไม่ให้ปิด
import { copyFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
  await q(`${S}.markSaved({ ...${S}.get().doc, source: ${JSON.stringify(saved.source)} }); return 1;`);
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
} finally {
  await q(`${S}?.closeDoc(); delete window.__closeDry; delete window.__closedDry; return 1;`).catch(() => {});
  await nav("ชั้นวางหนัง").catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => {});
}
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length}`);
process.exit(ok === results.length ? 0 : 1);
