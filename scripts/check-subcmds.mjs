// หน้าแก้ซับ ขั้น 6 คำสั่งเมนูเวลาและแก้ไข (แผนหน้าแก้ซับ · BUGS ข้อ 109) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-subcmds.mjs
// ① ตรรกะล้วน (window.__subCmdsLib) เทียบตัวเลขที่คิดมือจากซอร์ส Aegisub dialog_timing_processor.cpp กับ command/*.cpp
// ② กดจริงผ่านปุ่ม เมนู หน้าต่าง และคีย์ลัดในโปรแกรม กับหนังทดสอบ ฉากตัด (2025).mkv (24 fps keyframe 0 4 8 10 12 16 วินาที)
//    ซับที่ฝังในหนังมีบรรทัดความคิดเห็นอยู่แถวแรก (ลำดับที่ ffmpeg ใส่) ตัวตรวจจึงหาบรรทัดจากเวลา ไม่ใช้เลขแถว
//    ทุกคำสั่งเลิกทำแล้วเอกสารกลับเหมือนเดิมทุกช่อง · ปิด AUTO ระหว่างตรวจ เลือกบรรทัดแล้วภาพไม่ย้าย
// ③ หน้าตาแถบกับเมนูที่หน้าต่าง 1280 × 800 ทั้งเมนูซ้ายย่อและกาง ภาพลง docs/report-2026-11-14/แก้ซับ-ขั้น6/
// ไม่เขียนไฟล์ ไม่แตะคลิปบอร์ดของคนที่ใช้คอม (คัดลอกลง window.__subClipOut วางจาก window.__subClip)
import { mkdirSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const MOVIE = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv";
const SHOT = "docs/report-2026-11-14/แก้ซับ-ขั้น6";
mkdirSync(SHOT, { recursive: true });

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click();`);
const S = "window.__subEdit", L = "window.__subCmdsLib", V = "window.__vidLib";
const VK = { KeyI: 73, Digit3: 51, Digit4: 52, Digit5: 53, Digit6: 54, KeyD: 68, ArrowUp: 38, ArrowDown: 40, KeyC: 67, KeyX: 88, KeyV: 86, Delete: 46, KeyF: 70, KeyH: 72, F3: 114, Escape: 27 };
/** กดแป้นพร้อมปุ่มกำกับ · Alt 1 Ctrl 2 Shift 8 */
const press = async (code, mods = 0) => {
  const key = code.startsWith("Key") ? code.slice(3).toLowerCase() : code.startsWith("Digit") ? code.slice(5) : code;
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, modifiers: mods, windowsVirtualKeyCode: VK[code] ?? 0 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers: mods, windowsVirtualKeyCode: VK[code] ?? 0 });
  await sleep(180);
};
const focusGrid = () => q("document.querySelector('[data-sub-table]').focus(); return 1;");
const ev = () => q(`return ${S}.get().doc.events.map((e) => ({ id: e.id, start: e.start, end: e.end, text: e.text, style: e.style, actor: e.actor, layer: e.layer, comment: e.comment }));`);
const sel = (idx, active) => q(`const e = ${S}.get().doc.events; const ids = ${JSON.stringify(idx)}.map((i) => e[i].id); ${S}.select(ids, e[${active ?? idx[0]}].id); return 1;`);
const undoTop = () => q(`return ${S}.get().undo.at(-1)?.label ?? null;`);
const activeId = () => q(`return ${S}.get().active;`);
const seekF = async (f) => { await q(`${V}.seek(${f}); return 1;`); return waitFor(`return ${V}.get().pos === ${f};`, 8000); };
/** ช่องพิมพ์ของ React ต้องตั้งค่าผ่านตัวตั้งค่าเดิมแล้วส่งเหตุการณ์ input */
const setVal = (selector, v) => q(`const el = document.querySelector(${JSON.stringify(selector)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
const clickText = (scope, text) => q(`const b = [...document.querySelectorAll(${JSON.stringify(scope + " button")})].find((x) => x.innerText.trim() === ${JSON.stringify(text)}); if (!b) return false; b.click(); return true;`);
const swFind = (label) => q(`const b = [...document.querySelectorAll('[data-find] .se-dsw2')].find((x) => x.innerText.trim() === ${JSON.stringify(label)}).querySelector('button'); b.click(); return 1;`);
const dlgMsg = () => q("return document.querySelector('[data-dlgmsg]')?.innerText ?? '';");
const menu = async (m, item) => {
  await q(`document.querySelector('[data-cmdmenu=${m}]').click(); return 1;`); await sleep(200);
  const why = await q(`const b = document.querySelector('[data-cmdpanel=${m}] [data-cmd=${item}]'); if (!b) return 'ไม่เจอ'; if (b.getAttribute('aria-disabled')) { const w = b.title; document.querySelector('[data-cmdmenu=${m}]').click(); return w || 'กดไม่ได้'; } b.click(); return null;`);
  await sleep(200);
  return why;
};
/** ภาพหน้าต่างหลังแอนิเมชันเปิดจบ ไม่ได้ภาพโปร่ง */
const shotDlg = async (name) => { await sleep(450); await c.shot(`${SHOT}/${name}.png`, ".dlg", 4).catch(() => {});
  const g = await q("const d = document.querySelector('.dlg'); const over = [...d.querySelectorAll('.se-drow, .se-dlbl, .se-dstyles')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.className + ' ' + x.innerText.slice(0, 20)); const r = d.getBoundingClientRect(); return { over, inWin: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight };");
  check(`หน้าต่าง ${name.replace(/^[0-9]+-/, "")} ไม่มีแถวล้น ป้ายไม่ทับ ⓘ อยู่ในหน้าต่างโปรแกรม`, !g.over.length && g.inWin, JSON.stringify(g));
};
const snap = (t) => t + 5 - ((t + 5) % 10);
let ORIG = null;
/** เลิกทำจนเอกสารกลับเหมือนตอนเริ่ม แล้วเช็ก */
const restore = async (name, n = 1) => {
  for (let i = 0; i < n; i++) await q(`${S}.undo(); return 1;`);
  await sleep(120);
  check(`${name} เลิกทำแล้วเอกสารกลับเหมือนเดิมทุกช่อง`, JSON.stringify(await ev()) === ORIG);
};

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  await q(`try { for (const k of ['se-shift', 'se-shift-hist', 'se-post', 'se-select', 'se-over', 'se-find']) localStorage.removeItem(k); localStorage.setItem('se-aud', JSON.stringify({ link: false, volume: 0 })); localStorage.setItem('se-vauto', '0'); } catch {} return 1;`);
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  await nav("ซับไตเติล"); await sleep(300);
  await q("window.__subClear(); window.__subOpen(" + JSON.stringify(MOVIE) + "); return 1;");
  check("เปิดหนังทดสอบแล้วมีแถบคำสั่งเหนือตาราง", await waitFor("return !!document.querySelector('[data-se-cmds]')", 20000));
  check("อ่านเวลาเฟรมของหนังเสร็จ", await waitFor(`return !!${V}.rate() && ${V}.get().pos != null;`, 20000));
  await sleep(800);
  ORIG = JSON.stringify(await ev());
  const E0 = JSON.parse(ORIG);
  // บรรทัดในซับทดสอบ (test-media/src/full.ass) หาจากเวลาเริ่ม
  const at = (ms) => E0.findIndex((e) => e.start === ms && !e.comment);
  const A = at(500), B = at(4100), P = at(4000), D = at(8300), F = at(12000), G = at(16100), C = E0.findIndex((e) => e.comment);
  check("ซับในหนังมี 7 บรรทัดครบ รวมบรรทัดความคิดเห็น", E0.length === 7 && [A, B, P, D, F, G, C].every((i) => i >= 0) && B === A + 1, JSON.stringify({ A, B, P, D, F, G, C }));
  const R = (i) => i + 1;

  // ================================================================ ① ตรรกะล้วน ปรับเวลาทั้งไฟล์
  const lib = await q(`const Lb = ${L}, d0 = ${S}.get().doc, base = d0.events.find((e) => !e.comment);
    const mk = (a) => ({ ...d0, events: a.map(([s, e], i) => ({ ...base, id: 9000 + i, start: s, end: e, comment: false, raw: [], pre: [], ident: null })) });
    const off = { leadIn: null, leadOut: null, adjacent: null, keys: null, onlySel: false, styles: null };
    const t = (r) => typeof r === 'string' ? r : r.events.map((e) => [e.start, e.end]);
    const fr = window.__vidLib.Framerate.fps(24, 480);
    return {
      def: Lb.POST_DEFAULT,
      lin: t(Lb.postProcess(mk([[1000, 2000], [2050, 3000], [2500, 4000]]), new Set(), { ...off, leadIn: 100 }, null, [], 0)),
      lout: t(Lb.postProcess(mk([[1000, 2000], [2200, 3000], [2900, 4000]]), new Set(), { ...off, leadOut: 350 }, null, [], 0)),
      adj: t(Lb.postProcess(mk([[1000, 2000], [2250, 3000], [2980, 4000], [4400, 5000]]), new Set(), { ...off, adjacent: { gap: 300, overlap: 50, bias: 0.9 } }, null, [], 0)),
      kf: t(Lb.postProcess(mk([[3850, 6000], [4100, 7950], [4150, 9000]]), new Set(), { ...off, keys: { sb: 200, sa: 150, eb: 200, ea: 250 } }, fr, [96, 192], 0)),
      bad: t(Lb.postProcess(mk([[1000, 2000], [3000, 2500]]), new Set(), { ...off, leadIn: 100 }, null, [], 0)),
      all: t(Lb.postProcess(mk([[1000, 2000], [2050, 3000], [2500, 4000], [8000, 9000]]), new Set(), Lb.POST_DEFAULT, fr, [96, 192], 0)),
    };`);
  check("ค่าตั้งต้นเท่า default_config.json ของ Aegisub (เผื่อหน้า 100 เผื่อท้าย 350 ห่าง 300 ซ้อน 50 จุดต่อ 0.9 keyframe 200 150 200 250)",
    JSON.stringify(lib.def) === JSON.stringify({ leadIn: 100, leadOut: 350, adjacent: { gap: 300, overlap: 50, bias: 0.9 }, keys: { sb: 200, sa: 150, eb: 200, ea: 250 }, onlySel: false, styles: null }), JSON.stringify(lib.def));
  check("เผื่อหน้า 100 ไม่ล้ำเวลาจบของบรรทัดก่อนที่ไม่ซ้อนกัน แต่บรรทัดที่ซ้อนอยู่แล้วเผื่อได้เต็ม (900 2000 2400)", JSON.stringify(lib.lin.map((x) => x[0])) === "[900,2000,2400]", JSON.stringify(lib.lin));
  check("เผื่อท้าย 350 ไม่ล้ำเวลาเริ่มของบรรทัดถัดไปที่ไม่ซ้อนกัน (2200 3350 4350)", JSON.stringify(lib.lout.map((x) => x[1])) === "[2200,3350,4350]", JSON.stringify(lib.lout));
  check("ต่อบรรทัด ห่าง 250 ต่อที่ 2230 ซ้อน 20 ต่อที่ 2980 ห่าง 400 ไม่ต่อ (ตัดเศษแบบ int แล้วปัดหนึ่งในร้อยวินาที)", JSON.stringify(lib.adj) === "[[1000,2230],[2230,2980],[2980,4000],[4400,5000]]", JSON.stringify(lib.adj));
  check("ดูด keyframe เริ่มก่อน keyframe 129 ms ดูด เริ่มหลัง 121 ms ดูด หลัง 171 ms ไม่ดูด จบก่อน keyframe 29 ms ดูดไปเฟรมก่อน keyframe", JSON.stringify(lib.kf) === "[[3980,6000],[3980,7980],[4150,9000]]", JSON.stringify(lib.kf));
  check("บรรทัดที่เวลาจบก่อนเริ่ม ไม่ทำอะไรแล้วบอกเลขบรรทัด", typeof lib.bad === "string" && lib.bad.includes("บรรทัดที่ 2"), String(lib.bad));
  check("ค่าตั้งต้นทั้งสี่กติกาได้เวลาเป็นหนึ่งในร้อยวินาทีทุกตัว", Array.isArray(lib.all) && lib.all.flat().every((x) => x % 10 === 0), JSON.stringify(lib.all));

  // ================================================================ ② ปุ่มและหน้าต่าง
  // ---------- เลื่อนเวลา ----------
  await sel([A]); await focusGrid();
  await press("KeyI", 2);
  check("Ctrl+I เปิดหน้าต่างเลื่อนเวลา", await waitFor("return !!document.querySelector('[data-shift]')", 3000));
  await setVal("[data-shift-amount]", "0:00:01.00");
  await clickText("[data-shift]", "ไปข้างหน้า"); await clickText("[data-shift]", "ทุกบรรทัด"); await clickText("[data-shift]", "ทั้งเริ่มและจบ");
  await shotDlg("1-เลื่อนเวลา");
  await q("document.querySelector('[data-shift-run]').click(); return 1;"); await sleep(250);
  let e1 = await ev();
  check("เลื่อนเวลาทุกบรรทัดไปข้างหน้า 1 วินาที รวมบรรทัดความคิดเห็น ข้อความผลบอกจำนวนบรรทัด", e1.every((x, i) => x.start === E0[i].start + 1000 && x.end === E0[i].end + 1000) && (await undoTop()) === "เลื่อนเวลา"
    && /เลื่อนเวลา 7 บรรทัดแล้ว/.test(await q("return document.querySelector('[data-se-cnote]')?.innerText ?? '';")), JSON.stringify(e1.map((x) => x.start)));
  await c.shot(`${SHOT}/1b-ข้อความผลแทนตัวนับ.png`, ".se-gridbar", 6);
  await restore("เลื่อนเวลา");
  // เป็นเฟรม เฉพาะที่เลือก เฉพาะเริ่ม
  await sel([B]); await focusGrid(); await press("KeyI", 2);
  await waitFor("return !!document.querySelector('[data-shift]')", 3000);
  const hist = await q("return document.querySelectorAll('[data-shift-hist] .se-vmi').length;");
  check("ประวัติที่เคยเลื่อนขึ้นในหน้าต่าง 1 รายการ", hist === 1, String(hist));
  await clickText("[data-shift]", "เฟรม"); await setVal("[data-shift-amount]", "24");
  await clickText("[data-shift]", "ถอยหลัง"); await clickText("[data-shift]", "ที่เลือก"); await clickText("[data-shift]", "เฉพาะเริ่ม");
  await q("document.querySelector('[data-shift-run]').click(); return 1;"); await sleep(250);
  e1 = await ev();
  const exF = await q(`const f = ${V}.rate(); const s = f.timeAt(f.frameAt(4100, 'start') - 24, 'start'); return s + 5 - ((s + 5) % 10);`);
  check("เลื่อนเป็นเฟรม ถอยหลัง 24 เฟรม เฉพาะบรรทัดที่เลือก เฉพาะเวลาเริ่ม (4.10 ไปราว 3.10 คิดจากเฟรม)", e1[B].start === exF && Math.abs(exF - 3100) <= 50 && e1[B].end === E0[B].end && e1[A].start === E0[A].start, `${e1[B].start} ${exF}`);
  await restore("เลื่อนเป็นเฟรม");
  // ตั้งแต่ที่เลือกลงไป
  await sel([D]); await focusGrid(); await press("KeyI", 2); await waitFor("return !!document.querySelector('[data-shift]')", 3000);
  await clickText("[data-shift]", "เวลา"); await setVal("[data-shift-amount]", "0:00:00.50"); await clickText("[data-shift]", "ไปข้างหน้า");
  await clickText("[data-shift]", "ตั้งแต่ที่เลือกลงไป"); await clickText("[data-shift]", "ทั้งเริ่มและจบ");
  await q("document.querySelector('[data-shift-run]').click(); return 1;"); await sleep(250);
  e1 = await ev();
  check("ตั้งแต่ที่เลือกลงไป เลื่อนตั้งแต่แถวที่เลือกถึงท้ายไฟล์ แถวก่อนหน้าอยู่ที่เดิม", e1.slice(0, D).every((x, i) => x.start === E0[i].start) && e1.slice(D).every((x, i) => x.start === E0[i + D].start + 500));
  await restore("ตั้งแต่ที่เลือกลงไป");
  // พิมพ์เวลาผิด ปุ่มกดไม่ได้พร้อมเหตุผล
  await press("KeyI", 2); await waitFor("return !!document.querySelector('[data-shift]')", 3000);
  await setVal("[data-shift-amount]", "abc");
  const bad = await q("const b = document.querySelector('[data-shift-run]'); return [b.getAttribute('aria-disabled'), b.title];");
  check("พิมพ์เวลาอ่านไม่ออก ปุ่มเลื่อนเวลากดไม่ได้และบอกเหตุผล", bad[0] === "true" && bad[1].includes("พิมพ์เวลา"), JSON.stringify(bad));
  await c.key("Escape"); await sleep(200);
  check("Esc ปิดหน้าต่างเลื่อนเวลา", !(await q("return !!document.querySelector('[data-shift]');")));

  // ---------- ปรับเวลาทั้งไฟล์ ----------
  await q("document.querySelector('[data-se-post]').click(); return 1;");
  check("ปุ่มปรับเวลาเปิดหน้าต่าง", await waitFor("return !!document.querySelector('[data-post]')", 3000));
  await shotDlg("2-ปรับเวลาทั้งไฟล์");
  const expPost = await q(`const r = ${L}.postProcess(${S}.get().doc, new Set(), ${L}.POST_DEFAULT, ${V}.rate(), ${V}.keys().list, 0); return typeof r === 'string' ? r : r.events.map((e) => [e.start, e.end]);`);
  await q("document.querySelector('[data-post-run]').click(); return 1;"); await sleep(300);
  e1 = await ev();
  const got = e1.map((x) => [x.start, x.end]);
  check("ปรับเวลาด้วยค่าตั้งต้น ผลตรงกับตรรกะ บรรทัดความคิดเห็นไม่ถูกแตะ หน้าต่างปิด", JSON.stringify(got) === JSON.stringify(expPost) && e1[C].start === E0[C].start && e1[C].end === E0[C].end
    && !(await q("return !!document.querySelector('[data-post]');")) && (await undoTop()) === "ปรับเวลาทั้งไฟล์", `${JSON.stringify(got)} ตรรกะ ${JSON.stringify(expPost)}`);
  // บรรทัด 0.50 ถึง 3.40 เผื่อหน้าเหลือ 0.40 (keyframe 0 ห่างเกิน 150 ms ไม่ดูด) · เผื่อท้าย 3.75 ต่อกับป้ายในฉากที่ 3.89 แล้วดูดไปเฟรมก่อน keyframe 96 ที่ 3.98
  check("บรรทัด 0.50 ถึง 3.40 ได้ 0.40 ถึง 3.98 (เผื่อหน้า เผื่อท้าย ต่อบรรทัด แล้วดูดเข้า keyframe ตามลำดับ)", e1[A].start === 400 && e1[A].end === 3980, `${e1[A].start} ${e1[A].end}`);
  await restore("ปรับเวลาทั้งไฟล์");

  // ---------- สอดเวลากับภาพ Ctrl+3 4 5 6 ----------
  await seekF(120);
  const T120 = await q(`const f = ${V}.rate(); return { s: f.timeAt(120, 'start'), e: f.timeAt(120, 'end'), k0: f.timeAt(96, 'start'), k1: f.timeAt(191, 'end') };`);
  await sel([B]); await focusGrid();
  await press("Digit3", 2);
  e1 = await ev();
  check("Ctrl+3 เวลาเริ่มไปที่เฟรม 120 ที่ภาพแสดง (4.98)", e1[B].start === snap(T120.s) && e1[B].end === E0[B].end && (await undoTop()) === "สอดเวลาเริ่มกับภาพ", `${e1[B].start} ${T120.s}`);
  await restore("Ctrl+3");
  await press("Digit4", 2);
  e1 = await ev();
  check("Ctrl+4 เวลาจบไปที่เฟรม 120 (5.02) เวลาเริ่มเดิม", e1[B].end === snap(T120.e) && e1[B].start === E0[B].start, `${e1[B].end} ${T120.e}`);
  await restore("Ctrl+4");
  await press("Digit5", 2);
  e1 = await ev();
  check("Ctrl+5 ยาวเต็มฉาก จาก keyframe 96 (3.98) ถึงเฟรมก่อน keyframe 192 (7.98)", e1[B].start === snap(T120.k0) && e1[B].end === snap(T120.k1), `${e1[B].start} ${e1[B].end}`);
  await restore("Ctrl+5");
  await press("Digit6", 2);
  e1 = await ev();
  check("Ctrl+6 เลื่อนบรรทัดให้เริ่มที่เฟรม 120 ความยาวเท่าเดิม", e1[B].start === snap(T120.s) && e1[B].end - e1[B].start === E0[B].end - E0[B].start, `${e1[B].start} ${e1[B].end}`);
  await restore("Ctrl+6");
  // เมนูเวลา ทำให้เวลาต่อกัน
  await sel([A, B]);
  check("ทำให้เวลาต่อกัน เปลี่ยนเวลาเริ่ม กดได้", (await menu("time", "adjstart")) === null);
  e1 = await ev();
  check("บรรทัด 4.10 เริ่มที่เวลาจบของบรรทัด 0.50 (3.40)", e1[B].start === 3400 && e1[A].end === 3400, `${e1[B].start}`);
  await restore("ทำให้เวลาต่อกัน เปลี่ยนเวลาเริ่ม");
  await menu("time", "adjend");
  e1 = await ev();
  check("ทำให้เวลาต่อกัน เปลี่ยนเวลาจบ บรรทัด 0.50 จบที่เวลาเริ่มของบรรทัดถัดไป (4.10)", e1[A].end === 4100 && e1[B].start === 4100, `${e1[A].end}`);
  await restore("ทำให้เวลาต่อกัน เปลี่ยนเวลาจบ");
  await sel([A, P]);
  const adjWhy = await menu("time", "adjstart");
  check("เลือกบรรทัดไม่ติดกัน ทำให้เวลาต่อกันกดไม่ได้ บอกเหตุผล", adjWhy === "บรรทัดที่เลือกต้องอยู่ติดกัน", String(adjWhy));

  // ---------- แทรก ----------
  await sel([A]);
  await menu("line", "insafter");
  e1 = await ev();
  check("แทรกหลัง บรรทัดใหม่ 3.40 ถึง 4.00 (ยาวไม่เกินบรรทัดที่เริ่ม 4.00) เลเยอร์ 0 สไตล์เดิม ข้อความว่าง ถูกเลือก",
    e1.length === 8 && e1[A + 1].start === 3400 && e1[A + 1].end === 4000 && e1[A + 1].text === "" && e1[A + 1].style === E0[A].style && (await activeId()) === e1[A + 1].id, JSON.stringify(e1[A + 1]));
  await restore("แทรกหลัง");
  await sel([A]); await menu("line", "insbefore");
  e1 = await ev();
  check("แทรกก่อนบรรทัด 0.50 เวลาไม่ติดลบ 0.00 ถึง 0.50", e1[A].start === 0 && e1[A].end === 500 && e1[A + 1].id === E0[A].id, JSON.stringify(e1[A]));
  await restore("แทรกก่อน");
  await sel([A]); await menu("line", "insafterv");
  e1 = await ev();
  check("แทรกหลังที่เวลาภาพ เริ่มเฟรม 120 ยาว 3 วินาที", e1[A + 1].start === snap(T120.s) && e1[A + 1].end === snap(T120.s + 3000), `${e1[A + 1].start} ${e1[A + 1].end}`);
  await restore("แทรกที่เวลาภาพ");

  // ---------- ทำสำเนา แยกที่เฟรม Ctrl+D Ctrl+Shift+D ----------
  await sel([A]); await menu("line", "dup");
  e1 = await ev();
  check("ทำสำเนา บรรทัดซ้ำต่อท้าย ทุกช่องเหมือนเดิม เลือกบรรทัดใหม่", e1.length === 8 && e1[A + 1].text === E0[A].text && e1[A + 1].start === 500 && e1[A + 1].actor === E0[A].actor && e1[A + 1].id !== E0[A].id && (await activeId()) === e1[A + 1].id);
  await restore("ทำสำเนา");
  await seekF(48);
  const T48 = await q(`const f = ${V}.rate(); return { s: f.timeAt(48, 'start'), e47: f.timeAt(47, 'end'), e48: f.timeAt(48, 'end'), s49: f.timeAt(49, 'start') };`);
  await sel([A]); await focusGrid(); await press("KeyD", 2);
  e1 = await ev();
  check("Ctrl+D แยกก่อนเฟรมที่แสดง บรรทัดแรกจบที่เฟรม 47 บรรทัดใหม่เริ่มที่เฟรม 48 (1.98)", e1.length === 8 && e1[A].end === snap(T48.e47) && e1[A + 1].start === snap(T48.s) && e1[A + 1].end === 3400 && e1[A + 1].text === E0[A].text, `${e1[A].end} ${e1[A + 1].start}`);
  await restore("Ctrl+D");
  await press("KeyD", 2 + 8);
  e1 = await ev();
  check("Ctrl+Shift+D แยกหลังเฟรมที่แสดง บรรทัดแรกจบที่เฟรม 48 บรรทัดใหม่เริ่มเฟรม 49 (2.02)", e1[A].end === snap(T48.e48) && e1[A + 1].start === snap(T48.s49), `${e1[A].end} ${e1[A + 1].start}`);
  await restore("Ctrl+Shift+D");

  // ---------- แยกตรงเคอร์เซอร์ ----------
  const putCursor = (k) => q(`const t = document.querySelector('[data-se-text]'); t.focus(); t.setSelectionRange(${k}, ${k}); return t.value;`);
  await sel([A]); await sleep(150);
  const box0 = await putCursor(9);
  await menu("line", "splitest");
  e1 = await ev();
  check("แยกตรงเคอร์เซอร์ แบ่งเวลาตามความยาวข้อความ 9 กับ 12 ตัว ได้ 1.74 (Aegisub ตัดเศษ)", e1.length === 8 && e1[A].text === "สวัสดีค่ะ" && e1[A + 1].text === "นี่คือฉากแรก" && e1[A].end === 1740 && e1[A + 1].start === 1740 && e1[A + 1].end === 3400, `${box0} · ${e1[A].end}`);
  await restore("แยกแบ่งเวลา");
  await sel([A]); await sleep(120); await putCursor(9);
  await menu("line", "splitkeep");
  e1 = await ev();
  check("แยกตรงเคอร์เซอร์ ใช้เวลาเดิมทั้งสองบรรทัด", e1[A].start === 500 && e1[A].end === 3400 && e1[A + 1].start === 500 && e1[A + 1].end === 3400);
  await restore("แยกเวลาเดิม");
  await sel([A]); await sleep(120); await putCursor(9);
  await menu("line", "splitvid");
  e1 = await ev();
  check("แยกตรงเคอร์เซอร์ที่เฟรมที่แสดง (เฟรม 48 จบ 2.02)", e1[A].end === snap(T48.e48) && e1[A + 1].start === snap(T48.e48), `${e1[A].end}`);
  await restore("แยกที่เฟรม");
  // บรรทัดที่มี \N เคอร์เซอร์ต้นบรรทัดที่สองของช่องพิมพ์ ไม่ทิ้ง \N ค้าง
  await sel([B]); await sleep(150);
  const b1 = await q("return document.querySelector('[data-se-text]').value;");
  await putCursor(b1.indexOf("\n") + 1);
  await q("document.querySelector('[data-se-split]').click(); return 1;"); await sleep(200);
  e1 = await ev();
  check("ปุ่มแยกในช่องแก้บรรทัด เคอร์เซอร์ต้นบรรทัดที่สอง ท่อนแรกไม่มี \\N ค้าง ท่อนหลังเป็นบรรทัดที่สอง", e1.length === 8 && !/\\N$/.test(e1[B].text) && e1[B].text.endsWith("{\\b0}") && e1[B + 1].text === "ขึ้นบรรทัดใหม่", `${JSON.stringify(e1[B].text)} | ${JSON.stringify(e1[B + 1].text)}`);
  await restore("แยกที่ขึ้นบรรทัด");

  // ---------- รวม ย้าย สลับ ----------
  await sel([A, B]); await menu("line", "joincat");
  e1 = await ev();
  check("รวม ต่อข้อความด้วยเว้นวรรค เวลาจบช้าสุด 7.20", e1.length === 6 && e1[A].text === `${E0[A].text} ${E0[B].text}` && e1[A].start === 500 && e1[A].end === 7200);
  await restore("รวมต่อข้อความ");
  await sel([A, B]); await menu("line", "joinfirst");
  e1 = await ev();
  check("รวม เก็บข้อความบรรทัดแรก", e1.length === 6 && e1[A].text === E0[A].text && e1[A].end === 7200);
  await restore("รวมเก็บข้อความแรก");
  await sel([A]); await q("document.querySelector('[data-se-join]').click(); return 1;"); await sleep(200);
  e1 = await ev();
  check("ปุ่มรวมกับถัดไปในช่องแก้บรรทัด เลือกบรรทัดเดียวรวมกับบรรทัดถัดไป", e1.length === 6 && e1[A].text === `${E0[A].text} ${E0[B].text}`);
  await restore("ปุ่มรวมกับถัดไป");
  await sel([B]); await focusGrid(); await press("ArrowDown", 1);
  e1 = await ev();
  check("Alt+↓ ในตาราง ย้ายบรรทัดลงหนึ่งแถว แถวที่เลือกยังเป็นบรรทัดเดิม", e1[B + 1].id === E0[B].id && e1[B].id === E0[B + 1].id && (await activeId()) === E0[B].id && (await undoTop()) === "ย้ายบรรทัดลง");
  await press("ArrowUp", 1);
  check("Alt+↑ ย้ายกลับ", JSON.stringify((await ev()).map((x) => x.id)) === JSON.stringify(E0.map((x) => x.id)));
  await restore("ย้ายบรรทัด", 2);
  await sel([A, P]); await menu("line", "swap");
  e1 = await ev();
  check("สลับสองบรรทัดที่เลือก", e1[A].id === E0[P].id && e1[P].id === E0[A].id);
  await restore("สลับ");
  await sel([A]);
  check("เลือกบรรทัดเดียว สลับกดไม่ได้ บอกเหตุผล", (await menu("line", "swap")) === "เลือกให้ครบสองบรรทัดก่อน");

  // ---------- เรียง ----------
  await q("document.querySelector('[data-cmdmenu=time]').click(); return 1;"); await sleep(150);
  await q("document.querySelector('[data-cmdpanel=time] [data-cmd=sort]').click(); return 1;"); await sleep(250);
  check("เมนูเวลา เรียงบรรทัด เปิดหน้าต่าง", await waitFor("return !!document.querySelector('[data-sort]')", 3000));
  await shotDlg("3-เรียงบรรทัด");
  await clickText("[data-sort]", "เวลาเริ่ม"); await clickText("[data-sort]", "ทั้งไฟล์");
  await q("document.querySelector('[data-sort-run]').click(); return 1;"); await sleep(200);
  e1 = await ev();
  const sorted = E0.slice().sort((x, y) => x.start - y.start).map((x) => x.id);
  check("เรียงตามเวลาเริ่ม บรรทัดความคิดเห็น 8.00 ย้ายไปอยู่ตามเวลา ป้ายในฉาก 4.00 ขึ้นก่อน 4.10", JSON.stringify(e1.map((x) => x.id)) === JSON.stringify(sorted) && e1[0].id === E0[A].id && e1[1].id === E0[P].id, JSON.stringify(e1.map((x) => x.start)));
  await restore("เรียงบรรทัด");

  // ---------- เลือก ----------
  await q("document.querySelector('[data-cmdmenu=sel]').click(); return 1;"); await sleep(150);
  await q("document.querySelector('[data-cmdpanel=sel] [data-cmd=select]').click(); return 1;"); await sleep(250);
  check("เมนูเลือก เปิดหน้าต่างเลือกบรรทัด", await waitFor("return !!document.querySelector('[data-select]')", 3000));
  await setVal("[data-select-find]", "ดาว"); await clickText("[data-select]", "ตัวละคร"); await clickText("[data-select]", "ตรงทั้งช่อง"); await clickText("[data-select]", "เลือกใหม่");
  await q("document.querySelector('[data-select-run]').click(); return 1;"); await sleep(200);
  let st = await q(`const s = ${S}.get(); return { sel: s.sel, msg: document.querySelector('[data-dlgmsg]')?.innerText ?? '' };`);
  check("เลือกตัวละคร ดาว ได้บรรทัด 0.50 กับ 8.30 บอกผลในหน้าต่าง", JSON.stringify(st.sel) === JSON.stringify([E0[A].id, E0[D].id]) && st.msg === "เลือกไว้ 2 บรรทัด", JSON.stringify(st));
  await shotDlg("4-เลือกบรรทัด");
  await clickText("[data-select]", "รูปแบบค้นหา"); await setVal("[data-select-find]", "(");
  await q("document.querySelector('[data-select-run]').click(); return 1;"); await sleep(150);
  st = await q(`return { m: document.querySelector('[data-dlgmsg]')?.innerText ?? '', sel: ${S}.get().sel };`);
  check("รูปแบบค้นหาผิด บอกว่ารูปแบบไม่ถูกต้อง ไม่เปลี่ยนที่เลือก", st.m.startsWith("รูปแบบค้นหาไม่ถูกต้อง") && st.sel.length === 2, st.m);
  await c.key("Escape"); await sleep(150);
  await seekF(120);
  await menu("sel", "visible");
  st = await q(`return ${S}.get().sel;`);
  check("เลือกบรรทัดที่ขึ้นบนภาพเฟรม 120 ได้บรรทัด 4.10 กับป้ายในฉาก", JSON.stringify(st) === JSON.stringify([E0[B].id, E0[P].id].sort((x, y) => E0.findIndex((e) => e.id === x) - E0.findIndex((e) => e.id === y))), JSON.stringify(st));
  await menu("sel", "goto"); await waitFor("return !!document.querySelector('[data-goto-q]')", 3000);
  await setVal("[data-goto-q]", "0:00:12.50"); await q("document.querySelector('[data-goto-go]').click(); return 1;"); await sleep(200);
  check("ไปที่เวลา 0:00:12.50 ได้บรรทัด 12.00", (await activeId()) === E0[F].id);
  await menu("sel", "goto"); await waitFor("return !!document.querySelector('[data-goto-q]')", 3000);
  await setVal("[data-goto-q]", "99"); await q("document.querySelector('[data-goto-go]').click(); return 1;"); await sleep(150);
  check("ไปที่บรรทัด 99 ที่ไม่มี หน้าต่างไม่ปิด บอกว่าไม่เจอ", await q("return !!document.querySelector('[data-goto-q].err') && document.querySelector('.dlg .se-dlgtext').innerText.startsWith('ไม่เจอ');"));
  await setVal("[data-goto-q]", "5"); await q("document.querySelector('[data-goto-go]').click(); return 1;"); await sleep(150);
  check("ไปที่บรรทัด 5 ตามเลขแถวในตาราง", (await activeId()) === E0[4].id);

  // ---------- คัดลอก ตัด วาง วางทับ ----------
  await q("window.__subClipOut = []; return 1;");
  await sel([A, B]); await focusGrid(); await press("KeyC", 2);
  const out = await q("return window.__subClipOut;");
  check("Ctrl+C คัดลอกสองบรรทัดเป็นบรรทัด Dialogue ของ ASS ไม่แตะคลิปบอร์ดจริง", out.length === 1 && out[0].split("\r\n").length === 2 && out[0].startsWith("Dialogue: 0,0:00:00.50,0:00:03.40,Default,ดาว,0,0,0,,สวัสดีค่ะ"), JSON.stringify(out[0]?.slice(0, 80)));
  await q("window.__subClip = window.__subClipOut[0]; return 1;");
  await sel([D]); await focusGrid(); await press("KeyV", 2);
  e1 = await ev();
  check("Ctrl+V วางสองบรรทัดก่อนบรรทัดที่กำลังแก้ ทุกช่องเหมือนต้นฉบับ เลือกบรรทัดที่วาง", e1.length === 9 && e1[D].text === E0[A].text && e1[D + 1].text === E0[B].text && e1[D + 1].start === 4100 && e1[D].actor === "ดาว" && e1[D + 2].id === E0[D].id
    && JSON.stringify(await q(`return ${S}.get().sel;`)) === JSON.stringify([e1[D].id, e1[D + 1].id]));
  await restore("วาง");
  await sel([A]); await focusGrid(); await press("KeyX", 2);
  e1 = await ev();
  check("Ctrl+X ตัดบรรทัด คัดลอกแล้วลบ", e1.length === 6 && e1[A].id === E0[B].id && (await q("return window.__subClipOut.length;")) === 2);
  await restore("ตัด");
  await q(`window.__subClip = "Dialogue: 3,0:00:01.00,0:00:02.00,Song,X,0,0,0,,ข้อความวางทับ"; return 1;`);
  await sel([A]); await focusGrid(); await press("KeyV", 2 + 8);
  check("Ctrl+Shift+V เปิดหน้าต่างวางทับ", await waitFor("return !!document.querySelector('[data-over]')", 3000));
  await q(`for (const b of document.querySelectorAll('[data-over-field]')) { const want = ['start', 'end'].includes(b.dataset.overField); if (b.checked !== want) b.click(); } return 1;`);
  await shotDlg("5-วางทับ");
  await q("document.querySelector('[data-over-run]').click(); return 1;"); await sleep(200);
  e1 = await ev();
  check("วางทับเฉพาะเวลาเริ่มจบ ข้อความ สไตล์ ตัวละคร เลเยอร์เดิมอยู่ครบ", e1[A].start === 1000 && e1[A].end === 2000 && e1[A].text === E0[A].text && e1[A].style === E0[A].style && e1[A].actor === E0[A].actor && e1[A].layer === E0[A].layer);
  await restore("วางทับ");
  await q(`window.__subClip = "Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,ก\\r\\nDialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,ข"; return 1;`);
  await sel([A, D]); await focusGrid(); await press("KeyV", 2 + 8); await waitFor("return !!document.querySelector('[data-over]')", 3000);
  await q("document.querySelector('[data-over-run]').click(); return 1;"); await sleep(200);
  e1 = await ev();
  check("เลือกสองบรรทัดที่ไม่ติดกัน วางทับเฉพาะบรรทัดที่เลือกตามลำดับ (แบบ Aegisub)", e1[A].start === 1000 && e1[D].start === 5000 && e1[B].start === E0[B].start, `${e1[A].start} ${e1[D].start}`);
  await restore("วางทับหลายบรรทัด");
  await q("delete window.__subClip; delete window.__subClipOut; return 1;");
  await sel([P]); await focusGrid(); await press("Delete", 2);
  e1 = await ev();
  check("Ctrl+Delete ลบบรรทัดที่เลือก", e1.length === 6 && !e1.some((x) => x.id === E0[P].id));
  await restore("ลบ");

  // ---------- ค้นและแทนที่ ----------
  await sel([A]); await focusGrid(); await press("KeyH", 2);
  check("Ctrl+H เปิดค้นและแทนที่", await waitFor("return !!document.querySelector('[data-find-repl]')", 3000));
  await setVal("[data-find-text]", "ฉาก"); await setVal("[data-find-repl]", "ตอน");
  await q("document.querySelector('[data-find-next]').click(); return 1;"); await sleep(150);
  let fm = await q(`return { a: ${S}.get().active, m: document.querySelector('[data-dlgmsg]')?.innerText ?? '' };`);
  check(`ค้นต่อไป เจอที่บรรทัด ${R(A)} จากทั้งหมด 3 จุด`, fm.a === E0[A].id && fm.m === `เจอที่บรรทัด ${R(A)} จากทั้งหมด 3 จุด`, fm.m);
  await q("document.querySelector('[data-find-next]').click(); return 1;"); await sleep(150);
  fm = await q(`return { a: ${S}.get().active, m: document.querySelector('[data-dlgmsg]')?.innerText ?? '' };`);
  check(`ค้นต่อไปอีกครั้ง ไปบรรทัด ${R(B)}`, fm.a === E0[B].id && fm.m.startsWith(`เจอที่บรรทัด ${R(B)}`), fm.m);
  await shotDlg("6-ค้นและแทนที่");
  await q("document.querySelector('[data-find-one]').click(); return 1;"); await sleep(200);
  e1 = await ev();
  fm = await q(`return { a: ${S}.get().active, m: document.querySelector('[data-dlgmsg]')?.innerText ?? '' };`);
  check(`แทนที่ทีละจุด แทนที่บรรทัด ${R(B)} แล้วไปจุดถัดไปที่บรรทัด ${R(G)}`, e1[B].text.startsWith("ตอนที่สอง") && e1[A].text === E0[A].text && fm.a === E0[G].id && fm.m === `เจอที่บรรทัด ${R(G)} จากทั้งหมด 2 จุด`, `${e1[B].text.slice(0, 12)} ${fm.m}`);
  await restore("แทนที่ทีละจุด");
  await q("document.querySelector('[data-find-all]').click(); return 1;"); await sleep(200);
  e1 = await ev();
  check("แทนที่ทั้งหมด 3 จุด เลิกทำได้ทีเดียว", e1[A].text.includes("ตอนแรก") && e1[G].text.startsWith("ตอนสุดท้าย") && (await undoTop()) === "แทนที่ทั้งหมด 3 จุด" && (await dlgMsg()) === "แทนที่แล้ว 3 จุด");
  await restore("แทนที่ทั้งหมด");
  // รูปแบบค้นหากับกลุ่ม
  await swFind("รูปแบบค้นหา");
  await setVal("[data-find-text]", "ฉาก(แรก|สุดท้าย)"); await setVal("[data-find-repl]", "[$1]");
  await q("document.querySelector('[data-find-all]').click(); return 1;"); await sleep(200);
  e1 = await ev();
  check("รูปแบบค้นหา แทนที่ด้วยกลุ่มที่จับ $1", e1[A].text === "สวัสดีค่ะ นี่คือ[แรก]" && e1[G].text.startsWith("[สุดท้าย]"), e1[A].text);
  await restore("แทนที่ด้วยกลุ่ม");
  await swFind("รูปแบบค้นหา");
  await swFind("ตรงทั้งคำ");
  await setVal("[data-find-text]", "ฉาก");
  await q("document.querySelector('[data-find-next]').click(); return 1;"); await sleep(150);
  check("ตรงทั้งคำ ค้น ฉาก ในประโยคไทยที่ไม่เว้นวรรค ไม่เจอ (แบบที่ ⓘ บอก)", (await dlgMsg()) === "ไม่เจอคำนี้");
  await swFind("ตรงทั้งคำ");
  await setVal("[data-find-text]", "i1");
  await q("document.querySelector('[data-find-next]').click(); return 1;"); await sleep(150);
  const withTag = await dlgMsg();
  await swFind("ข้ามแท็ก");
  await q("document.querySelector('[data-find-next]').click(); return 1;"); await sleep(150);
  const skipTag = await dlgMsg();
  check("ค้น i1 เจอในแท็ก {\\i1} แต่เปิดข้ามแท็กแล้วไม่เจอ", withTag.startsWith(`เจอที่บรรทัด ${R(B)}`) && skipTag === "ไม่เจอคำนี้", `${withTag} / ${skipTag}`);
  await swFind("ข้ามแท็ก");
  await c.key("Escape"); await sleep(150);
  await sel([A]); await focusGrid(); await press("F3");
  check("F3 ค้นต่อด้วยคำเดิมโดยไม่เปิดหน้าต่าง", (await activeId()) === E0[B].id && !(await q("return !!document.querySelector('[data-find]');")));
  await press("KeyF", 2);
  check("Ctrl+F เปิดหน้าต่างค้นหาแบบไม่มีช่องแทนที่", await waitFor("return !!document.querySelector('[data-find]') && !document.querySelector('[data-find-repl]')", 3000));
  await c.key("Escape"); await sleep(150);
  check("หลังทุกคำสั่ง เอกสารเหมือนตอนเปิดทุกช่อง", JSON.stringify(await ev()) === ORIG);

  // ================================================================ ③ หน้าตา
  await sel([A]);
  const NM = { time: "เวลา", line: "บรรทัด", sel: "เลือก" };
  const geom = async (tag, shots) => {
    const g = await q(`const b = document.querySelector('.se-gridbar'), pw = document.querySelector('.pagewrap');
      const kids = [...b.querySelectorAll('[data-se-cmds] > *, [data-se-count], .seg')].map((k) => k.getBoundingClientRect()).map((r) => [Math.round(r.left), Math.round(r.right)]);
      let overlap = 0; for (let i = 1; i < kids.length; i++) if (kids[i][0] < kids[i - 1][1]) overlap++;
      return { sw: b.scrollWidth, cw: b.clientWidth, overlap, over: pw.scrollHeight - pw.clientHeight, overX: pw.scrollWidth - pw.clientWidth, h: Math.round(b.getBoundingClientRect().height) };`);
    check(`${tag} แถบเหนือตารางไม่ล้น ปุ่มไม่ซ้อน หน้าไม่เลื่อน แถบสูงไม่เกิน 28`, g.sw <= g.cw && !g.overlap && g.over <= 0 && g.overX <= 0 && g.h <= 28, JSON.stringify(g));
    for (const m of ["time", "line", "sel"]) {
      await q(`document.querySelector('[data-cmdmenu=${m}]').click(); return 1;`); await sleep(250);
      const p = await q(`const el = document.querySelector('[data-cmdpanel=${m}]'); const r = el.getBoundingClientRect();
        const cut = [...el.querySelectorAll('.se-cml, .se-ckey')].filter((x) => x.scrollWidth > x.clientWidth + 1 || x.getBoundingClientRect().right > r.right).length;
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right), sh: el.scrollHeight, ch: el.clientHeight, vh: innerHeight, vw: innerWidth, cut };`);
      check(`${tag} เมนู${NM[m]} อยู่ในหน้าต่างทั้งกล่อง ไม่ต้องเลื่อนในเมนู ข้อความไม่โดนตัด`, p.top >= 0 && p.bottom <= p.vh && p.right <= p.vw && p.sh <= p.ch + 1 && !p.cut, JSON.stringify(p));
      if (shots) await c.shot(`${SHOT}/7-เมนู${NM[m]}.png`, `[data-cmdpanel=${m}]`, 6);
      await q(`document.querySelector('[data-cmdmenu=${m}]').click(); return 1;`); await sleep(150);
    }
  };
  const sideW = () => q("return Math.round(document.querySelector('.side').getBoundingClientRect().width);");
  const w1 = await sideW();
  await geom(w1 < 100 ? "เมนูซ้ายย่อ" : "เมนูซ้ายกาง", true);
  await c.shot(`${SHOT}/8-แถบเหนือตาราง-${w1 < 100 ? "เมนูซ้ายย่อ" : "เมนูซ้ายกาง"}.png`, ".se-gridbar", 6);
  // สลับเมนูซ้ายแล้ววัดอีกแบบ แล้วคืน
  await q("document.querySelector('.side .navtoggle').click(); return 1;"); await sleep(700);
  const w2 = await sideW();
  check("สลับเมนูซ้ายได้", w2 !== w1, `${w1} ${w2}`);
  await geom(w2 < 100 ? "เมนูซ้ายย่อ" : "เมนูซ้ายกาง", false);
  await c.shot(`${SHOT}/8-แถบเหนือตาราง-${w2 < 100 ? "เมนูซ้ายย่อ" : "เมนูซ้ายกาง"}.png`, ".se-gridbar", 6);
  await q("document.querySelector('.side .navtoggle').click(); return 1;"); await sleep(700);
  // กดในกล่อง ⓘ ของเมนูแล้วเมนูไม่ปิด
  await q("document.querySelector('[data-cmdmenu=line]').click(); return 1;"); await sleep(200);
  await q("document.querySelector('[data-cmdpanel=line] .se-cmh button.infob').click(); return 1;"); await sleep(300);
  const tipOk = await q("return !!document.querySelector('.infotip[data-tip=\"เมนูบรรทัด\"]');");
  if (tipOk) { await c.click(".infotip[data-tip=\"เมนูบรรทัด\"] .tw"); await sleep(200); }
  check("ⓘ หัวเมนูบรรทัดเปิดคำอธิบาย กดในกล่องคำอธิบายแล้วเมนูยังเปิดอยู่", tipOk && (await q("return !!document.querySelector('[data-cmdpanel=line]');")));
  await c.shot(`${SHOT}/9-คำอธิบายเมนูบรรทัด.png`, ".infotip", 6).catch(() => {});
  await c.key("Escape"); await sleep(150); await c.key("Escape"); await sleep(150);
  // เมนูวิดีโอของขั้น 4 ที่มี ⓘ ข้างในได้ผลเดียวกัน
  await q("document.querySelector('[data-vmenu]').click(); return 1;"); await sleep(250);
  await q("document.querySelector('[data-vmenupanel] button.infob').click(); return 1;"); await sleep(300);
  const vtip = await q("return document.querySelector('.infotip')?.dataset.tip ?? null;");
  if (vtip) { await c.click(".infotip .tw"); await sleep(200); }
  check("เมนูวิดีโอ กดในกล่องคำอธิบายแล้วเมนูยังเปิดอยู่", !!vtip && (await q("return !!document.querySelector('[data-vmenupanel]');")), String(vtip));
  await c.key("Escape"); await sleep(150); await c.key("Escape"); await sleep(150);
} finally {
  await q(`try { delete window.__subClip; delete window.__subClipOut; for (const k of ['se-shift', 'se-shift-hist', 'se-post', 'se-select', 'se-over', 'se-find']) localStorage.removeItem(k); localStorage.setItem('se-vauto', '1'); } catch {} return 1;`).catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  c.close();
}
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length} ข้อ`);
process.exit(ok === results.length ? 0 : 1);
