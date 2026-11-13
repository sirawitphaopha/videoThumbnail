// หน้าแก้ซับ ขั้น 5 คลื่นเสียง ลากเวลา เล่นเสียง (แผนหน้าแก้ซับ · BUGS ข้อ 109) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-subaudio.mjs
// ลากด้วยเมาส์จริงผ่าน CDP (drag ใน cdp-client.mjs) เวลาตรงจุดที่ลาก ดูดติด keyframe Shift ปิดดูด กดไกลขอบเริ่มช่วงใหม่ กดขวาตั้งจบ Alt เลื่อนทั้งบรรทัด Ctrl ลากขอบบรรทัดอื่น
// ยืนยันแล้วไปบรรทัดถัดไป เลิกทำ ปุ่ม 19 ปุ่ม คีย์ลัด แป้นตัวเลข ล้อเมาส์ ขอบล่าง แถบเลื่อน เล่นเสียงแล้วเวลาเดินจริง บันทึกเสียงของบรรทัด เปิดไฟล์เสียงแยก ขนาดจอ
// เล่นเสียงตั้งความดังเป็นศูนย์ ไม่มีเสียงออกลำโพงรบกวนคนที่ใช้คอม · ไฟล์ที่เขียนอยู่ใน D:\dev\tmp\ชั้นแก้ซับเสียง ลบตอนจบ
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const MOVIE = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv";
const SONG = "D:/movie-shelf/test-media/สร้าง/เสียงซับ/เพลงทดสอบ.wav";
const TMP = "D:/dev/tmp/ชั้นแก้ซับเสียง";
const SHOT = "docs/report-2026-11-13/แก้ซับ-ขั้น5";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(SHOT, { recursive: true });

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click();`);
const S = "window.__subEdit", T = "window.__subTiming";
const KEYS = { Enter: 13, Space: 32, KeyS: 83, KeyR: 82, KeyQ: 81, KeyH: 72, KeyZ: 90, KeyX: 88, KeyC: 67, KeyV: 86, KeyG: 71, KeyA: 65, KeyF: 70, NumpadAdd: 107, Numpad5: 101, Numpad6: 102, Numpad8: 104 };
const press = async (code, mods = 0, key = code, text) => {
  const vk = KEYS[code] ?? 0;
  await c.send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, modifiers: mods, windowsVirtualKeyCode: vk, ...(text ? { text, unmodifiedText: text } : {}) });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers: mods, windowsVirtualKeyCode: vk });
};
/** ขอบเวลาของบรรทัดที่กำลังแก้ ทั้งที่ลากไว้ (pend) และที่ลงบรรทัดแล้ว */
const state = () => q(`const s = ${S}.get(), t = ${T}.get(); const e = s.doc.events.find((x) => x.id === s.active); return { id: e.id, i: s.doc.events.indexOf(e), start: e.start, end: e.end, pend: t.pend, left: t.left, hz: t.opts.hzoom, undo: s.undo.length };`);
/** พิกัดบนจอของเวลา (เวลาซับ ms) บนภาพคลื่นเสียง */
const xy = async (ms) => q(`const b = document.querySelector('[data-aud]').getBoundingClientRect(); const t = ${T}.get(); const f = (lv) => { let x = 100; if (lv > 0) x += 25 * lv; else if (lv < 0) { if (lv >= -5) x += 10 * lv; else if (lv >= -11) x = 50 + (lv + 5) * 5; else x = 20 + lv + 11; if (x <= 0) x = 1; } return x; };
  const mpp = 2000 / f(t.opts.hzoom); return { x: b.left + (${ms} - t.left) / mpp, y: b.top + b.height / 2, mpp, top: b.top, h: b.height };`);
const dragT = async (fromMs, toMs, opt = {}) => { const a = await xy(fromMs), b = await xy(toMs); await c.drag(a.x, a.y, b.x, b.y, opt); await sleep(150); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  // ความดังศูนย์ (แยกโซ่) · ค่าตั้งอื่นเป็นค่าตั้งต้นแบบ Aegisub
  await q(`try { localStorage.setItem('se-aud', JSON.stringify({ link: false, volume: 0 })); localStorage.setItem('se-vauto', '1'); localStorage.removeItem('se-vzoom'); } catch {} return 1;`);
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  await nav("ซับไตเติล"); await sleep(300);
  await q("window.__subClear(); window.__subOpen(" + JSON.stringify(MOVIE) + "); return 1;");
  check("เปิดหนังทดสอบแล้วมีภาพคลื่นเสียง", await waitFor("return !!document.querySelector('[data-aud]')", 20000));
  await waitFor("return / - \\d+$/.test(document.querySelector('[data-vpos]')?.innerText ?? '')", 20000);
  await sleep(1500);
  const o0 = await q(`const t = ${T}.get(); return t.opts;`);
  check("ค่าตั้งต้นแบบ Aegisub ยืนยันทันทีปิด ไปต่อเองเปิด เลื่อนตามเปิด ซูม 100% ดูดติดเส้นเปิด", !o0.autoCommit && o0.autoNext && o0.autoScroll && o0.hzoom === 0 && !o0.medusa, JSON.stringify(o0));
  // รูปคลื่นขึ้นจริง ช่วงมีโทน (0.5 ถึง 3.4 วินาที) มีสีคลื่นกลางภาพ ช่วงเงียบไม่มี
  const pix = await q(`const cv = document.querySelector('[data-aud]'); const g = cv.getContext('2d'); const r = devicePixelRatio || 1; const b = cv.getBoundingClientRect();
    const t = ${T}.get(); const at = (ms) => { const x = Math.round(((ms - t.left) / 20) * r); const p = g.getImageData(x, Math.round(cv.height / 2 - 20 * r), 1, 1).data; return [p[0], p[1], p[2]]; };
    return { tone: at(2000), quiet: at(3700) };`);
  check("รูปคลื่นขึ้น ช่วงมีเสียงเป็นสีคลื่น ช่วงเงียบไม่มี", pix.tone[1] < 160 && pix.quiet[1] > 200, JSON.stringify(pix));
  await c.shot(`${SHOT}/1-คลื่นเสียง-1280.png`, "[data-subedit] .se-top", 6);

  // ---------- ลากขอบจบ ----------
  const s0 = await state();
  check("บรรทัดที่กำลังแก้คือ 0.50 ถึง 3.40 วินาที", s0.start === 500 && s0.end === 3400, JSON.stringify(s0));
  await dragT(3400, 2400);
  const s1 = await state();
  check("ลากขอบจบไปซ้าย 1 วินาที ขอบที่ลากไว้เป็น 2.40 ยังไม่ลงบรรทัด", s1.pend && near(s1.pend.end, 2400, 25) && s1.pend.start === 500 && s1.end === 3400, JSON.stringify(s1.pend));
  const grid1 = await q(`const s = ${S}.get(); return document.querySelector('[data-sub-table] tr[data-id="' + s.active + '"]').children[3].innerText;`);
  check("ตารางยังเป็นเวลาเดิมจนกว่าจะยืนยัน", grid1 === "0:00:03.40", grid1);
  await q("document.querySelector('[data-aud]').focus(); return 1;");
  await press("Enter", 0, "Enter", "\r"); await sleep(200);
  const s2 = await q(`const s = ${S}.get(); const e = s.doc.events.find((x) => x.id === ${s0.id}); return { end: e.end, active: s.active, label: s.undo.at(-1)?.label, pend: ${T}.get().pend };`);
  check("Enter ยืนยัน เวลาลงบรรทัด (ปัดเป็นหนึ่งในร้อยวินาทีแบบ ASS) แล้วไปบรรทัดถัดไปเอง", near(s2.end, 2400, 30) && s2.end % 10 === 0 && s2.active !== s0.id && s2.label === "ตั้งเวลาบนคลื่นเสียง" && !s2.pend, JSON.stringify(s2));
  await q(`${S}.undo(); ${S}.select([${s0.id}], ${s0.id}); return 1;`); await sleep(200);
  check("เลิกทำได้เวลาเดิม", (await state()).end === 3400);

  // ---------- ดูดติด keyframe กับ Shift ----------
  await dragT(3400, 3950);
  const s3 = await state();
  // เส้น keyframe อยู่ที่เวลา START ของเฟรม 96 คือกึ่งกลางระหว่างเฟรม 95 (3.958) กับ 96 (4.000) = 3.979 (Aegisub วางเส้นแบบนี้)
  // ใกล้กว่าขอบบรรทัดถัดไปที่ 4.00 จึงดูดติด keyframe
  check("ลากขอบจบไปราว 3.95 วินาที ดูดติดเส้น keyframe ที่ 3.979 (ใกล้กว่าขอบบรรทัดถัดไปที่ 4.00)", s3.pend?.end === 3979, JSON.stringify(s3.pend));
  await q(`${T}.setPend(null); return 1;`);
  await dragT(3400, 3950, { modifiers: 8 });
  const s4 = await state();
  check("กด Shift ระหว่างลาก ไม่ดูดติด ได้ราว 3.95", s4.pend && near(s4.pend.end, 3950, 15) && s4.pend.end !== 3979, JSON.stringify(s4.pend));
  await q(`${T}.setPend(null); return 1;`);

  // ---------- กดไกลขอบเริ่มช่วงใหม่ · กดขวาตั้งจบ · Alt เลื่อนทั้งบรรทัด ----------
  await dragT(1500, 2600);
  const s5 = await state();
  check("กดซ้ายกลางช่วงไกลจากขอบแล้วลาก ได้ช่วงใหม่ 1.50 ถึง 2.60", s5.pend && near(s5.pend.start, 1500, 25) && near(s5.pend.end, 2600, 25), JSON.stringify(s5.pend));
  await q(`${T}.setPend(null); return 1;`);
  const r2 = await xy(2000);
  await c.drag(r2.x, r2.y, r2.x, r2.y, { button: "right", steps: 1 }); await sleep(150);
  const s6 = await state();
  check("กดขวาตั้งเวลาจบที่จุดกด 2.00 ขอบเริ่มอยู่ที่เดิม", s6.pend && near(s6.pend.end, 2000, 25) && s6.pend.start === 500, JSON.stringify(s6.pend));
  await q(`${T}.setPend(null); return 1;`);
  await dragT(1000, 1500, { modifiers: 1 });
  const s7 = await state();
  check("Alt ลากเลื่อนทั้งบรรทัด 0.5 วินาที ความยาวเท่าเดิม", s7.pend && near(s7.pend.start, 1000, 25) && s7.pend.end - s7.pend.start === 2900, JSON.stringify(s7.pend));
  await q(`${T}.setPend(null); return 1;`);

  // ---------- Ctrl ลากขอบของบรรทัดอื่นที่อยู่ตรงเดียวกัน ----------
  const other = await q(`const s = ${S}.get(); const e = s.doc.events.find((x) => !x.comment && x.start === 4000); return e ? { id: e.id, start: e.start } : null;`);
  await q(`${S}.updateEvent(${s0.id}, { end: 4000 }, "ทดสอบ"); return 1;`); await sleep(150);
  await dragT(4000, 4500, { modifiers: 2 + 8 });
  const s8 = await state();
  check("Ctrl ลากขอบจบ ขอบเริ่มของบรรทัดที่เริ่ม 4.00 ลากตามไปด้วย", other && s8.pend && near(s8.pend.end, 4500, 25) && s8.pend.links.some((l) => l.id === other.id && near(l.start, 4500, 25)), JSON.stringify(s8.pend));
  await q(`document.querySelector('[data-se-ab=commit]').click(); return 1;`); await sleep(200);
  const s9 = await q(`const s = ${S}.get(); return [s.doc.events.find((x) => x.id === ${s0.id}).end, s.doc.events.find((x) => x.id === ${other?.id ?? -1})?.start];`);
  check("ยืนยันแล้วทั้งสองบรรทัดเปลี่ยนในการแก้ขั้นเดียว", near(s9[0], 4500, 30) && near(s9[1], 4500, 30), JSON.stringify(s9));
  await q(`${S}.undo(); ${S}.undo(); ${S}.select([${s0.id}], ${s0.id}); return 1;`); await sleep(200);
  check("เลิกทำสองขั้นคืนทั้งสองบรรทัด", (await state()).end === 3400 && (await q(`return ${S}.get().doc.events.find((x) => x.id === ${other?.id ?? -1})?.start;`)) === 4000);

  // ---------- ปุ่มกลางพาภาพหนังไปเวลานั้น ----------
  const r3 = await xy(2000);
  await c.drag(r3.x, r3.y, r3.x, r3.y, { button: "middle", steps: 1 }); await sleep(200);
  const vp = await q("return document.querySelector('[data-vpos]').innerText;");
  check("ปุ่มกลางของเมาส์พาภาพหนังไปเฟรมที่ 2.00 วินาที (เฟรม 48)", /- 48$/.test(vp), vp);

  // ---------- ปุ่มแถวเสียง ----------
  const bar = await q(`return { mode: document.querySelector('[data-se-atb]').dataset.seAtb, n: document.querySelectorAll('[data-se-ab]').length };`);
  check("หน้าต่าง 1280 × 800 แถวปุ่มแบบ 1 ไอคอนอย่างเดียวใต้คลื่นเสียง 19 ปุ่ม", bar.mode === "compact" && bar.n === 19, JSON.stringify(bar));
  await q(`document.querySelector('[data-se-ab=leadin]').click(); return 1;`); await sleep(100);
  await q(`document.querySelector('[data-se-ab=leadout]').click(); return 1;`); await sleep(100);
  const s10 = await state();
  check("เผื่อหน้า 100 ms เผื่อท้าย 350 ms รอยืนยัน", s10.pend?.start === 400 && s10.pend?.end === 3750 && s10.end === 3400, JSON.stringify(s10.pend));
  await q(`${T}.setPend(null); ${T}.setOpt('autoCommit', true); return 1;`);
  await q(`document.querySelector('[data-se-ab=leadin]').click(); return 1;`); await sleep(150);
  const s11 = await state();
  check("เปิดยืนยันทันที กดเผื่อหน้าแล้วลงบรรทัดเลย", s11.start === 400 && !s11.pend, JSON.stringify(s11));
  await q(`${T}.setOpt('autoCommit', false); ${S}.undo(); return 1;`); await sleep(100);
  const tog = await q(`const b = document.querySelector('[data-se-ab=autoScroll]'); const before = b.getAttribute('aria-pressed'); b.click(); await new Promise((r) => setTimeout(r, 80)); const after = b.getAttribute('aria-pressed'); b.click(); return [before, after, ${T}.get().opts.autoScroll];`);
  check("ปุ่มเลื่อนตามกดสลับได้ ปุ่มบอกสถานะ", tog[0] === "true" && tog[1] === "false" && tog[2] === true, JSON.stringify(tog));
  // ไปที่ช่วง · เลื่อนภาพไปไกลแล้วกด ช่วงกลับมาในภาพ
  await q(`${T}.setLeft(15000); return 1;`); await sleep(100);
  await q(`document.querySelector('[data-se-ab=goto]').click(); return 1;`); await sleep(100);
  const lf = (await state()).left;
  check("ไปที่ช่วง ภาพคลื่นเสียงกลับมาที่บรรทัด", lf < 500, String(lf));
  // ภาพความถี่
  await q(`document.querySelector('[data-se-ab=spectrum]').click(); return 1;`);
  await sleep(2500);
  // ช่วงเงียบที่ 3.7 วินาที ภาพความถี่เป็นสีเข้มสุด (เงียบ) · รูปคลื่นตรงนั้นเป็นพื้นขาว
  const dark = await q(`const cv = document.querySelector('[data-aud]'); const r = devicePixelRatio || 1; const t = ${T}.get(); const p = cv.getContext('2d').getImageData(Math.round(((3700 - t.left) / 20) * r), Math.round(cv.height * 0.5), 1, 1).data; return p[0] + p[1] + p[2];`);
  check("ภาพความถี่ขึ้น พื้นเข้ม", dark < 300, String(dark));
  await c.shot(`${SHOT}/2-ภาพความถี่.png`, "[data-subedit] .se-top", 6);
  await q(`document.querySelector('[data-se-ab=spectrum]').click(); return 1;`); await sleep(300);

  // ---------- เล่นเสียง (ความดังศูนย์) ----------
  await c.click("[data-se-ab=playsel]");
  check("กดเล่นช่วง เสียงเริ่มเล่น", await waitFor("return window.__audioNow().playing && window.__audioNow().now != null", 6000), JSON.stringify(await q("return window.__audioNow();")));
  const n1 = (await q("return window.__audioNow().now;")) ?? 0;
  await sleep(600);
  const n2 = (await q("return window.__audioNow().now;")) ?? 0;
  check("เวลาที่เล่นเดินจริงราวเวลาจริง", n2 - n1 > 400 && n2 - n1 < 900 && n1 >= 450, `${Math.round(n1)} → ${Math.round(n2)}`);
  await c.shot(`${SHOT}/3-กำลังเล่น.png`, "[data-subedit] .se-top", 6);
  await c.click("[data-se-ab=stop]");
  check("กดหยุดแล้วหยุด", await waitFor("return !window.__audioNow().playing", 2000));
  await c.click("[data-se-ab=before]");
  await waitFor("return window.__audioNow().playing", 5000);
  check("ฟังก่อนช่วง เล่นครึ่งวินาทีแล้วหยุดเอง", await waitFor("return !window.__audioNow().playing", 4000));

  // ---------- คีย์ลัด ----------
  await q("document.querySelector('[data-sub-table]').focus(); return 1;");
  await press("KeyC", 0, "c"); await sleep(80);
  await press("KeyV", 0, "v"); await sleep(80);
  const k1 = await state();
  check("C เผื่อหน้า V เผื่อท้าย", k1.pend?.start === 400 && k1.pend?.end === 3750, JSON.stringify(k1.pend));
  await press("NumpadAdd", 0, "+"); await sleep(80);
  check("ปุ่มบวกของแป้นตัวเลข ยืดเวลาจบ 10 ms", (await state()).pend?.end === 3760);
  await press("KeyG", 0, "g"); await sleep(200);
  const k2 = await q(`const s = ${S}.get(); return { end: s.doc.events.find((x) => x.id === ${s0.id}).end, moved: s.active !== ${s0.id} };`);
  check("G ยืนยันแล้วไปบรรทัดถัดไป", k2.end === 3760 && k2.moved, JSON.stringify(k2));
  await press("KeyZ", 0, "z"); await sleep(150);
  check("Z กลับบรรทัดก่อน", (await state()).id === s0.id);
  await q(`${S}.undo(); return 1;`);
  await press("KeyX", 0, "x"); await sleep(150);
  check("X ไปบรรทัดถัดไป", (await state()).id !== s0.id);
  await press("KeyZ", 0, "z"); await sleep(150);
  const l0 = (await state()).left;
  await press("KeyF", 0, "f"); await sleep(80);
  const l1 = (await state()).left;
  check("F เลื่อนภาพคลื่นเสียงไปขวา 128 จุด", near(l1 - l0, 128 * 20, 1), `${l0} → ${l1}`);
  await press("KeyA", 0, "a"); await sleep(80);
  await press("KeyS", 0, "s");
  check("S เล่นช่วงที่เลือก", await waitFor("return window.__audioNow().playing", 5000));
  await press("KeyH", 0, "h");
  check("H หยุด", await waitFor("return !window.__audioNow().playing", 2000));
  // พิมพ์ในช่องข้อความ ตัวอักษรเดี่ยวไม่เป็นคีย์ลัด
  await q("const t = document.querySelector('[data-se-text]'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); return 1;");
  await press("KeyC", 0, "c", "c"); await sleep(100);
  const typed = await q(`return { text: document.querySelector('[data-se-text]').value, pend: ${T}.get().pend };`);
  check("พิมพ์ C ในช่องข้อความ ได้ตัวอักษร ไม่เผื่อหน้า", typed.text.endsWith("c") && !typed.pend, JSON.stringify(typed));
  await q(`${S}.undo(); return 1;`);

  // ---------- แป้นตัวเลข (Medusa) ----------
  await q(`document.querySelector('[data-se-ab=medusa]').click(); return 1;`); await sleep(100);
  await q("const t = document.querySelector('[data-se-text]'); t.focus(); return 1;");
  const before = await q("return document.querySelector('[data-se-text]').value;");
  await press("Numpad6", 0, "6", "6"); await sleep(100);
  const m1 = await q(`return { text: document.querySelector('[data-se-text]').value, pend: ${T}.get().pend };`);
  check("เปิดแป้นตัวเลข กด 6 ในช่องพิมพ์ เลื่อนเวลาเริ่ม 10 ms ไม่พิมพ์เลข 6", m1.text === before && m1.pend?.start === 510, JSON.stringify(m1.pend));
  await press("Numpad5", 0, "5", "5");
  check("กด 5 เล่นช่วง", await waitFor("return window.__audioNow().playing", 5000));
  await press("Numpad8", 0, "8", "8");
  check("กด 8 หยุด", await waitFor("return !window.__audioNow().playing", 2000));
  await q(`document.querySelector('[data-se-ab=medusa]').click(); ${T}.setPend(null); return 1;`); await sleep(100);
  await q("const t = document.querySelector('[data-se-text]'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); return 1;");
  await press("Numpad6", 0, "6", "6"); await sleep(100);
  const m2 = await q(`return { text: document.querySelector('[data-se-text]').value, pend: ${T}.get().pend };`);
  check("ปิดแป้นตัวเลข กด 6 ในช่องพิมพ์ ได้เลข 6 ตามปกติ", m2.text.endsWith("6") && !m2.pend, JSON.stringify(m2));
  await q(`${S}.undo(); return 1;`);

  // ---------- ล้อเมาส์ ซูม ขอบล่าง ----------
  const wb = await xy(2000);
  await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: wb.x, y: wb.y, deltaX: 0, deltaY: -100, modifiers: 2 }); await sleep(150);
  const z1 = await state();
  const at2 = await xy(2000);
  check("Ctrl กับล้อซูมเข้าหนึ่งขั้น 125% เวลาตรงเมาส์อยู่ที่เดิม", z1.hz === 1 && near(at2.x, wb.x, 2), `${z1.hz} ${Math.round(wb.x)} ${Math.round(at2.x)}`);
  await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: wb.x, y: wb.y, deltaX: 0, deltaY: 100, modifiers: 0 }); await sleep(150);
  check("ล้อเมาส์เลื่อนภาพไปขวา", (await state()).left > z1.left, `${z1.left} → ${(await state()).left}`);
  await q(`${T}.setOpt('hzoom', 0); return 1;`);
  const g = await c.box("[data-se-grip]");
  await c.drag(g.x, g.y, g.x, g.y + 40, { steps: 4 }); await sleep(150);
  const hh = await q("return Math.round(document.querySelector('[data-aud]').getBoundingClientRect().height);");
  check("ลากขอบล่างลง 40 จุด คลื่นเสียงสูงขึ้น 40 จุด จำไว้", hh === 172 && (await q(`return ${T}.get().opts.height;`)) === 172, String(hh));
  await q(`${T}.setOpt('height', 132); return 1;`);

  // ---------- บันทึกเสียงของบรรทัด เปิดไฟล์เสียงแยก ----------
  const WAV = `${TMP}/บรรทัด.wav`;
  await q(`window.__audSave = ${JSON.stringify(WAV)}; document.querySelector('[data-se-amenu]').click(); return 1;`);
  await waitFor("return !!document.querySelector('[data-se-amenupanel]')");
  await q("document.querySelector('[data-se-asave]').click(); return 1;");
  await waitFor("return /บันทึกแล้ว/.test(document.querySelector('[data-se-amsg]')?.innerText ?? '')", 15000);
  const wavOk = existsSync(WAV) ? readFileSync(WAV) : null;
  // 2.9 วินาที สองช่องตามต้นฉบับ 48 kHz 16 บิต ราว 557 KB
  check("บันทึกเสียงของบรรทัดเป็น WAV ยาว 2.9 วินาที", !!wavOk && wavOk.subarray(0, 4).toString() === "RIFF" && near(wavOk.length, 2.9 * 48000 * 2 * 2, 4000), wavOk ? String(wavOk.length) : "ไม่มีไฟล์");
  await q(`window.__audOpen = ${JSON.stringify(SONG)}; document.querySelector('[data-se-aopen]').click(); return 1;`);
  check("เปิดไฟล์เสียงแยก กรอบเสียงใช้ไฟล์นั้น", await waitFor(`return ${T}.get().own?.name === "เพลงทดสอบ.wav"`, 10000));
  await q("document.querySelector('[data-se-amenu]').click(); return 1;");
  await waitFor("return !!document.querySelector('[data-se-amenupanel]')");
  check("เมนูบอกว่าเสียงจากไฟล์ที่เปิด", (await q("return document.querySelector('[data-se-asrc]').innerText;")) === "เพลงทดสอบ.wav");
  await q("document.querySelector('[data-se-amovie]').click(); return 1;"); await sleep(150);
  check("กลับไปใช้เสียงของหนัง", (await q(`return ${T}.get().own;`)) === null);

  // ---------- ขนาดจอ ----------
  const fit1280 = await q("const pw = document.querySelector('.pagewrap'); return { over: pw.scrollHeight - pw.clientHeight, page: document.documentElement.scrollWidth };");
  check("หน้าต่าง 1280 × 800 ไม่มีแถบเลื่อน ทั้งแนวตั้งและแนวนอน", fit1280.over <= 0 && fit1280.page <= 1280, JSON.stringify(fit1280));
  const overlap = async () => q(`const bs = [...document.querySelectorAll('[data-se-ab]')].map((b) => b.getBoundingClientRect()); let bad = 0; for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], b = bs[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad++; } const row = document.querySelector('[data-se-atb]'); return { bad, over: row.scrollWidth - row.clientWidth };`);
  const ov1 = await overlap();
  check("ปุ่ม 19 ปุ่มไม่ซ้อนกัน ไม่ล้นแถว", ov1.bad === 0 && ov1.over <= 0, JSON.stringify(ov1));
  for (const [w, h] of [[1600, 852], [1920, 1032], [2560, 1392]]) {
    await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(700);
    const st = await q(`const pw = document.querySelector('.pagewrap'); const row = document.querySelector('[data-se-atb]'); return { mode: row.dataset.seAtb, narrow: row.classList.contains('narrow'), over: pw.scrollHeight - pw.clientHeight, page: document.documentElement.scrollWidth };`);
    const ov = await overlap();
    const want = h >= 950 ? "wide" : "compact";
    check(`หน้าต่าง ${w} × ${h} แถวปุ่มแบบ${want === "wide" ? " 2 ชื่อสั้นเต็มความกว้าง" : " 1 ใต้คลื่นเสียง"} ไม่ซ้อน ไม่มีแถบเลื่อน`, st.mode === want && ov.bad === 0 && ov.over <= 0 && st.over <= 0 && st.page <= w, JSON.stringify({ ...st, ...ov }));
    if (w === 1920) await c.shot(`${SHOT}/4-แถวปุ่มแบบ2-1920.png`, "[data-subedit]", 4);
  }
} finally {
  await q(`try { window.__subTiming.setPend(null); window.__subTiming.setOpt('autoCommit', false); window.__subTiming.setOpt('medusa', false); ${S}.closeDoc(); window.__subClear(); delete window.__audSave; delete window.__audOpen; localStorage.removeItem('se-aud'); } catch {} return 1;`).catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => {});
  rmSync(TMP, { recursive: true, force: true });
}
const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass} จาก ${results.length} ข้อ`);
process.exit(pass === results.length ? 0 : 1);
