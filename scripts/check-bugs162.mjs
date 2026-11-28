// ตัวตรวจงาน BUGS ข้อ 162 (งานจาก ROADMAP ที่ทำบนเครื่องคลาวด์ได้ 28 พ.ย. 2569)
// เปิดหน้าจอจริงในระบบจำลองหน้าโปรแกรมบนเว็บ (docs/mockups/theme-live-app.html) ด้วย Playwright ไม่ต้องเปิดโปรแกรม ไม่ขึ้นจอ ใช้ได้บนเครื่องคลาวด์
// ใช้เซิร์ฟเวอร์ 1420 ที่เปิดอยู่ ไม่มีก็เปิด vite เองแล้วปิดตอนจบ · ตัวช่วยกับตัวรันยกจาก check-audit161.mjs
// node scripts/check-bugs162.mjs            ตรวจทุกข้อ
// node scripts/check-bugs162.mjs 1 2        ตรวจเฉพาะข้อย่อย 162.1 162.2 (ส่งเลขหลังจุด)
// SHOTS=<โฟลเดอร์> ถ่ายภาพหน้าจอท้ายแต่ละข้อไว้ดูด้วยตา (ข้อ-<เลข>.png)
import { spawn } from "child_process";
import { createRequire } from "module";
import { linesOf } from "./lib/lines.mjs";

if (process.platform === "win32") process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const BASE = "http://127.0.0.1:1420", URL = `${BASE}/docs/mockups/theme-live-app.html`;
const SUB_MOVIE = "D:\\หนัง\\ฉากตัด (2024).mkv"; // ข้อมูลตัวอย่างของหน้าแก้ซับ (SE_PATH ใน theme-live-app.html)
const up = async () => { try { return (await fetch(URL)).ok; } catch { return false; } };

// ---------------------------------------------------------------- ตัวช่วย
const nav = (p, label) => p.evaluate((l) => { const b = [...document.querySelectorAll("[data-navbar] button")].find((x) => x.querySelector(".navtxt")?.textContent.trim() === l); if (!b) throw new Error("ไม่เจอเมนู " + l); b.click(); }, label);
const click = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("ไม่เจอ " + s); e.click(); }, sel);
const clickText = (p, text, sel = "button,[role=tab],a") => p.evaluate(([t, s]) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const all = [...document.querySelectorAll(s)].filter(vis);
  const hit = all.find((e) => e.innerText.trim() === t) ?? all.find((e) => e.innerText.trim().startsWith(t));
  if (!hit) throw new Error("ไม่เจอปุ่ม " + t);
  hit.click();
}, [text, sel]);
const pick = (p, path) => p.evaluate((x) => { window.__pickNext = x; }, path);
/** สลับคำตอบของคำสั่งในระบบจำลอง · body เป็นฟังก์ชัน async ได้ตัวแปร a · เรียกตัวเดิมด้วย await window.__fxOverBase.<คำสั่ง>(a) */
const over = (p, cmd, body) => p.evaluate(([c, b]) => { const AF = Object.getPrototypeOf(async function () {}).constructor; (window.__fxOver ??= {})[c] = new AF("a", b); }, [cmd, body]);
/** สลับคำตอบตั้งแต่ก่อนหน้าโหลด (คำสั่งที่โปรแกรมเรียกตอนเปิด) แล้วโหลดหน้าใหม่ */
const overBoot = async (p, cmd, body) => {
  await p.addInitScript(([c, b]) => { const AF = Object.getPrototypeOf(async function () {}).constructor; (window.__fxOver ??= {})[c] = new AF("a", b); }, [cmd, body]);
  await p.reload(); await p.waitForSelector("[data-navbar]"); await wait(p, 1500);
};
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText ?? null, sel);
const wait = (p, ms) => p.waitForTimeout(ms);
/** เรียกฟังก์ชันจากไฟล์ ts ในหน้า · fn เป็นข้อความ body ที่ได้ตัวแปร m (โมดูล) กับ a (ค่าที่ส่ง) */
const mod = (p, file, body, arg) => p.evaluate(async ([f, b, a]) => new Function("m", "a", b)(await import(f), a), [file, body, arg]);

/** เปิดหน้าแก้ซับด้วยซับตัวอย่าง */
const subEdit = async (p) => { await nav(p, "ซับไตเติล"); await wait(p, 300); await p.evaluate((x) => window.__subOpen(x), SUB_MOVIE); await p.waitForSelector("[data-se-cps]", { timeout: 8000 }); await wait(p, 600); };

// ---------------------------------------------------------------- ข้อตรวจ แต่ละข้อเปิดหน้าใหม่ ข้อมูลตัวอย่างชุดเดิม
const T = {};
/** จุดตัดบรรทัดของกล่อง ⓘ ที่อ่านด้วยตาแล้ว · แก้คำแล้วรัน DUMP=1 อ่านจุดตัดใหม่ก่อนแก้ตารางนี้ */
const TIP_LINES = {
  cps: [
    "จำนวนตัวอักษรที่ต้องอ่านต่อหนึ่งวินาที",
    "นับแบบที่ตาเห็น สระบนล่างกับวรรณยุกต์นับรวมกับพยัญชนะ ⏎ ส่วนแท็ก ช่องว่าง วรรคตอน และตัวขึ้นบรรทัดไม่นับ",
    "เกณฑ์เตือน เกิน 20 ตัวต่อวินาทีคนส่วนใหญ่อ่านไม่ทัน ⏎ ช่องนี้กับช่องในตารางจะเป็นสีเตือน",
    "แนะนำยืดเวลาจบ ตัดคำ หรือแยกเป็นสองบรรทัด",
  ],
  keys: [
    "คีย์ลัดของทุกหน้า ตั้งใหม่แล้วใช้ได้ทันทีโดยไม่ต้องเปิดโปรแกรมใหม่",
    "แก้คีย์ กดปุ่มแก้ไขท้ายแถว แล้วกดคีย์ที่ต้องการในช่องรับคีย์ ⏎ คำสั่งหนึ่งมีได้ถึงสี่คีย์ และเอาคีย์ออกจนไม่มีเลยก็ได้",
    "คีย์ชนกัน คีย์เดียวกันใช้ได้กับคำสั่งเดียวในหน้าเดียวกัน ⏎ ตั้งคีย์ที่คำสั่งอื่นใช้อยู่แล้ว คีย์จะย้ายมาที่คำสั่งนี้",
    "ตอนพิมพ์ในช่อง คีย์ที่ไม่มี Ctrl หรือ Alt เป็นคีย์พิมพ์ตัวอักษร ⏎ จึงใช้ได้เฉพาะตอนไม่ได้พิมพ์ในช่อง",
    "แนะนำตั้งคีย์ที่มี Ctrl นำหน้า ซึ่งใช้ได้ทุกที่",
  ],
  fixed: [
    "คีย์ที่ทุกโปรแกรมของ Windows ใช้แบบเดียวกัน เช่น Esc ปิดหน้าต่าง ⏎ Tab ย้ายช่อง และลูกศรเลื่อนในรายการ จึงไม่เปิดให้ตั้งใหม่ ⏎ เพื่อให้ช่องและหน้าต่างยังใช้ได้แบบที่คุ้นมือ",
  ],
};

// 162.1 นับตัวอักษรต่อวินาทีแบบไทย -------------------------------------
T[1] = async (p, check) => {
  const r = await mod(p, "/src/lib/subText.ts", `const B = String.fromCharCode(92);
    return { thi: m.readChars("ที่"), tiao: m.readChars("เที่ยว"), nam: m.readChars("น้ำใจ"), punct: m.readChars("ไป!? ไหน... (ครับ)"), en: m.readChars("Hello, world."), mixed: m.readChars("ฉัน OK นะ"),
      cps: m.cps({ text: "{" + B + "i1}ที่นี่{" + B + "i0}" + B + "Nเที่ยว", start: 0, end: 1000 }) };`);
  check("162.1 สระบน สระล่าง วรรณยุกต์ สระอำ นับรวมกับพยัญชนะ ที่ 1 เที่ยว 4 น้ำใจ 3 แบบ Aegisub", r.thi === 1 && r.tiao === 4 && r.nam === 3, JSON.stringify(r));
  check("162.1 ไม่นับวรรคตอนกับช่องว่าง ไป!? ไหน... (ครับ) ได้ 8 Hello, world. ได้ 10", r.punct === 8 && r.en === 10 && r.mixed === 6, JSON.stringify(r));
  check("162.1 ตัวต่อวินาทีของหน้าแก้ซับไม่นับแท็กกับตัวขึ้นบรรทัด ที่นี่ เที่ยว ใน 1 วินาทีได้ 6", r.cps === 6, JSON.stringify(r));
  const v = await mod(p, "/src/components/SubViewer.tsx", `return [m.cpsChars("ที่นี่ไม่มีใครรู้"), m.cpsChars("น้ำใจ ไม่เคยเปลี่ยน!")];`);
  check("162.1 ตัวดูซับใช้ตัวนับเดียวกัน ที่นี่ไม่มีใครรู้ 9 น้ำใจ ไม่เคยเปลี่ยน! 13", v[0] === 9 && v[1] === 13, JSON.stringify(v));
  // ช่องตัวต่อวินาทีใต้ช่องพิมพ์กับคอลัมน์ในตารางใช้ตัวนับใหม่
  await subEdit(p);
  const ui = await p.evaluate(async () => {
    const m = await import("/src/lib/subText.ts");
    const row = document.querySelector("[data-se-grid] tbody tr.sel, [data-se-grid] tbody tr[aria-selected=true]") ?? document.querySelector("[data-se-grid] tbody tr");
    return { box: document.querySelector("[data-se-cps]")?.innerText ?? null, row: !!row };
  });
  check("162.1 ช่องตัวต่อวินาทีใต้ช่องพิมพ์ขึ้นตัวเลข", !!ui.box && /\d+ ตัวต่อวินาที/.test(ui.box), JSON.stringify(ui));
  // กล่อง ⓘ ของช่องนี้บอกวิธีนับใหม่ จุดตัดบรรทัดตรงความหมาย (หน้าต่าง 1280 × 800)
  await click(p, '[data-info="ตัวอักษรต่อวินาที"]'); await p.waitForSelector('[data-tip="ตัวอักษรต่อวินาที"]'); await wait(p, 300);
  const lines = await linesOf((code) => p.evaluate(`(async () => { ${code} })()`), '[data-tip="ตัวอักษรต่อวินาที"]');
  if (process.env.DUMP) console.log(JSON.stringify(lines, null, 1));
  const want = TIP_LINES.cps;
  check("162.1 กล่อง ⓘ ตัวอักษรต่อวินาทีบอกว่าสระบนล่างวรรณยุกต์นับรวมกับพยัญชนะ ตัดบรรทัดตามที่ตรวจไว้", !!lines && JSON.stringify(lines) === JSON.stringify(want), JSON.stringify(lines));
};

// 162.2 หน้าแก้ซับ Ctrl+A เลือกทุกบรรทัดได้ทุกที่ F3 ค้นต่อไปใช้ได้ตอนหน้าต่างค้นหาเปิด (ผู้ช่วยตรวจทาน F21) ---------
const seState = (p) => p.evaluate(() => { const s = window.__subEdit.get(); return { sel: s.sel.length, active: s.active, n: s.doc.events.length, text: s.doc.events.find((e) => e.id === s.active)?.text ?? "" }; });
const blur = (p) => p.evaluate(() => { document.activeElement?.blur?.(); });
T[2] = async (p, check) => {
  await subEdit(p);
  await blur(p);
  await p.keyboard.press("Control+KeyA"); await wait(p, 200);
  const all = await seState(p);
  check("162.2 Ctrl+A ตอนไม่ได้โฟกัสตารางเลือกทุกบรรทัด", all.sel === all.n && all.n > 1, JSON.stringify(all));
  // ในช่องพิมพ์ Ctrl+A ยังเลือกข้อความในช่อง ไม่เลือกทุกบรรทัด
  await p.evaluate(() => { const s = window.__subEdit.get(); window.__subEdit.select([s.doc.events[3].id], s.doc.events[3].id); }); await wait(p, 200);
  await p.focus("[data-se-text]"); await p.keyboard.press("Control+KeyA"); await wait(p, 200);
  const inField = await seState(p);
  const fieldSel = await p.evaluate(() => { const t = document.querySelector("[data-se-text]"); return t.selectionEnd - t.selectionStart; });
  check("162.2 Ctrl+A ในช่องพิมพ์เลือกข้อความในช่อง ไม่เลือกทุกบรรทัด", inField.sel === 1 && fieldSel > 0, JSON.stringify({ inField, fieldSel }));
  // F3 ระหว่างหน้าต่างค้นหาเปิด ไปบรรทัดที่มีคำถัดไปทีละบรรทัด
  await blur(p);
  await p.evaluate(() => window.__subEdit.select([window.__subEdit.get().doc.events[0].id], window.__subEdit.get().doc.events[0].id)); await wait(p, 200);
  await p.keyboard.press("Control+KeyF"); await p.waitForSelector("[data-find-text]"); await wait(p, 300);
  await p.fill("[data-find-text]", "ดาว");
  const seen = [];
  for (let i = 0; i < 3; i++) { await p.keyboard.press("F3"); await wait(p, 250); seen.push(await seState(p)); }
  const open = await p.evaluate(() => !!document.querySelector("[data-find]"));
  check("162.2 F3 ตอนหน้าต่างค้นหาเปิดไปบรรทัดที่มีคำค้นทีละบรรทัด หน้าต่างยังเปิดอยู่",
    open && seen.every((x) => x.text.includes("ดาว")) && new Set(seen.map((x) => x.active)).size === 3, JSON.stringify({ open, seen }));
  // คีย์ลัดอื่นของหน้ายังไม่ทะลุหน้าต่างค้นหา Ctrl+A ในหน้าต่างไม่เลือกทุกบรรทัด
  await p.focus("[data-find-text]"); await p.keyboard.press("Control+KeyA"); await wait(p, 200);
  const st = await seState(p);
  check("162.2 คีย์ลัดอื่นยังไม่ทำงานตอนหน้าต่างค้นหาเปิด", st.sel === 1, JSON.stringify(st));
};

// 162.3 หน้าตั้งค่าหัวข้อคีย์ลัด ตั้งคีย์ใหม่แล้วใช้ได้ทันที ----------------------------------------
const rowKeys = (p, id) => p.evaluate((i) => { const r = document.querySelector(`[data-hk-row="${i}"]`); return r ? { keys: [...r.querySelectorAll(".hk-kbd")].map((k) => k.innerText.trim()), custom: !!r.querySelector("[data-hk-custom]"), dash: !!r.querySelector(".hk-dash") } : null; }, id);
const saved = (p) => p.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke("get_settings")).settings.hotkeys ?? {});
const capture = async (p, combo) => { await p.focus("[data-hk-capture]"); await p.keyboard.press(combo); await wait(p, 150); return p.evaluate(() => { const m = document.querySelector("[data-hk-msg]"); return { text: m.innerText.trim(), cls: m.className }; }); };
T[3] = async (p, check) => {
  await nav(p, "ตั้งค่า"); await wait(p, 300);
  await click(p, '[data-setnav="hotkeys"]'); await p.waitForSelector('[data-setcard="hotkeys"]:not([hidden])'); await wait(p, 300);
  const groups = await p.evaluate(() => [...document.querySelectorAll("[data-hk-group]")].map((g) => g.dataset.hkGroup));
  const nrows = await p.evaluate(() => document.querySelectorAll("[data-hk-row]").length);
  const fixed = await p.evaluate(() => document.querySelectorAll("[data-hk-fixed] .hk-row").length);
  const KM = await mod(p, "/src/lib/keymap.ts", "return { g: m.KEY_GROUPS.map((x) => x.id), n: m.ACTIONS.length, f: m.FIXED_KEYS.length };");
  check("162.3 หัวข้อคีย์ลัดมีทุกกลุ่ม ทุกคำสั่งในทะเบียน และคีย์พื้นฐานที่ปรับไม่ได้", JSON.stringify(groups) === JSON.stringify(KM.g) && nrows === KM.n && fixed === KM.f, JSON.stringify({ groups, nrows, fixed, KM }));
  check("162.3 แถวเลือกทุกบรรทัดบอกคีย์ Ctrl+A และทำซ้ำบอกสองคีย์", JSON.stringify((await rowKeys(p, "sub.select-all")).keys) === '["Ctrl+A"]' && (await rowKeys(p, "sub.redo")).keys.length === 2, JSON.stringify([await rowKeys(p, "sub.select-all"), await rowKeys(p, "sub.redo")]));
  // ค้นด้วยคีย์และชื่อ
  await p.fill('[aria-label="ค้นคีย์ลัด"]', "Ctrl+P"); await wait(p, 200);
  const byKey = await p.evaluate(() => [...document.querySelectorAll("[data-hk-row]")].map((r) => r.dataset.hkRow));
  await p.fill('[aria-label="ค้นคีย์ลัด"]', "บันทึก"); await wait(p, 200);
  const byName = await p.evaluate(() => [...document.querySelectorAll("[data-hk-row]")].map((r) => r.dataset.hkRow));
  await p.fill('[aria-label="ค้นคีย์ลัด"]', "ไม่มีคำสั่งนี้"); await wait(p, 200);
  const none = await p.evaluate(() => ({ rows: document.querySelectorAll("[data-hk-row]").length, msg: !!document.querySelector("[data-hk-none]"), fixed: !!document.querySelector("[data-hk-fixed]") }));
  await p.fill('[aria-label="ค้นคีย์ลัด"]', ""); await wait(p, 200);
  check("162.3 ค้นด้วยคีย์ Ctrl+P เจอเล่นหรือหยุดหนัง ค้นคำว่าบันทึกเจอสองคำสั่ง ไม่เจอบอกว่าไม่มี",
    JSON.stringify(byKey) === '["vid.play"]' && JSON.stringify(byName) === '["sub.save","sub.save-as"]' && none.rows === 0 && none.msg && !none.fixed, JSON.stringify({ byKey, byName, none }));
  // แก้คีย์ เลือกทุกบรรทัดเป็น Ctrl+Shift+A
  await click(p, '[data-hk-edit="sub.select-all"]'); await p.waitForSelector('[data-hk-dialog="sub.select-all"]'); await wait(p, 300);
  const def0 = await p.evaluate(() => document.querySelector("[data-hk-default]").getAttribute("aria-disabled"));
  check("162.3 คำสั่งที่ยังใช้คีย์ตั้งต้น ปุ่มกลับค่าตั้งต้นของคำสั่งนี้กดไม่ได้", def0 === "true", def0);
  const res = await capture(p, "Control+KeyW");
  check("162.3 คีย์ที่หน้าต่างโปรแกรมใช้อยู่ Ctrl+W ตั้งไม่ได้ ปุ่มกดไม่ได้", res.cls.includes("bad") && /ตั้งไม่ได้/.test(res.text) && await p.evaluate(() => document.querySelector("[data-hk-replace]").getAttribute("aria-disabled") === "true"), JSON.stringify(res));
  const clash = await capture(p, "Control+KeyZ");
  check("162.3 คีย์ที่คำสั่งอื่นในหน้าเดียวกันใช้อยู่บอกชื่อคำสั่งนั้น", clash.cls.includes("warn") && clash.text.includes("เลิกทำ"), JSON.stringify(clash));
  const okMsg = await capture(p, "Control+Shift+KeyA");
  await click(p, "[data-hk-replace]");
  // รอจนแถวขึ้นคีย์ใหม่ ไม่รอเวลาตายตัว (เพิ่มคำสั่งหน้ากราฟแล้วหน้าวาดช้าลงนิดหนึ่ง ตกบางรอบ BUGS ข้อ 163.5)
  await p.waitForFunction(() => document.querySelector('[data-hk-row="sub.select-all"]')?.innerText.includes("Ctrl+Shift+A"), null, { timeout: 4000 }).catch(() => {});
  await wait(p, 150);
  const after = await rowKeys(p, "sub.select-all");
  const sv = await saved(p);
  check("162.3 กดใช้แทนคีย์เดิม แถวขึ้น Ctrl+Shift+A มีป้ายตั้งเอง และเก็บในค่าตั้ง hotkeys",
    okMsg.text === "ตั้ง Ctrl+Shift+A ได้" && JSON.stringify(after.keys) === '["Ctrl+Shift+A"]' && after.custom && JSON.stringify(sv["sub.select-all"]) === '["Ctrl+Shift+KeyA"]', JSON.stringify({ okMsg, after, sv }));
  // ย้ายคีย์ที่ชนกัน ทำซ้ำให้ใช้ Ctrl+Y แทนที่ไปเพิ่มให้ เลือกทุกบรรทัด แล้วทำซ้ำเหลือคีย์เดียว
  await capture(p, "Control+KeyY"); await click(p, "[data-hk-add]");
  await p.waitForFunction(() => !document.querySelector('[data-hk-row="sub.redo"]')?.innerText.includes("Ctrl+Y"), null, { timeout: 4000 }).catch(() => {});
  await wait(p, 150);
  const moved = { sel: await rowKeys(p, "sub.select-all"), redo: await rowKeys(p, "sub.redo") };
  check("162.3 เพิ่มคีย์ที่ชนกัน คีย์ย้ายมาจากคำสั่งเดิม", JSON.stringify(moved.sel.keys) === '["Ctrl+Shift+A","Ctrl+Y"]' && JSON.stringify(moved.redo.keys) === '["Ctrl+Shift+Z"]' && moved.redo.custom, JSON.stringify(moved));
  await click(p, '[data-hk-remove="Ctrl+KeyY"]'); await wait(p, 200);
  await p.keyboard.press("Escape"); await wait(p, 300);
  const closed = await p.evaluate(() => !document.querySelector("[data-hk-dialog]"));
  check("162.3 กดเอาคีย์ออกได้ และ Esc ปิดหน้าต่างแก้คีย์", closed && JSON.stringify((await rowKeys(p, "sub.select-all")).keys) === '["Ctrl+Shift+A"]', JSON.stringify(await rowKeys(p, "sub.select-all")));
  // คีย์ใหม่ใช้ได้ทันทีในหน้าแก้ซับ คีย์เดิมเลิกทำงาน และเมนูบอกคีย์ใหม่
  await subEdit(p); await blur(p);
  await p.keyboard.press("Control+KeyA"); await wait(p, 200);
  const oldKey = await seState(p);
  await p.keyboard.press("Control+Shift+KeyA"); await wait(p, 200);
  const newKey = await seState(p);
  check("162.3 ตั้งใหม่แล้ว Ctrl+A เลิกเลือกทุกบรรทัด Ctrl+Shift+A เลือกแทน โดยไม่ต้องเปิดหน้าใหม่", oldKey.sel === 1 && newKey.sel === newKey.n, JSON.stringify({ oldKey, newKey }));
  // กลับค่าตั้งต้นทั้งหมด
  await nav(p, "ตั้งค่า"); await wait(p, 300); await click(p, '[data-setnav="hotkeys"]'); await wait(p, 300);
  await click(p, "[data-hk-reset-all]"); await p.waitForSelector("[data-hk-reset-yes]"); await click(p, "[data-hk-reset-yes]"); await wait(p, 300);
  const back = { sel: await rowKeys(p, "sub.select-all"), redo: await rowKeys(p, "sub.redo"), sv: await saved(p), btn: await p.evaluate(() => document.querySelector("[data-hk-reset-all]").getAttribute("aria-disabled")) };
  check("162.3 กลับค่าตั้งต้นทั้งหมด คีย์คืนครบ ค่าตั้งว่าง ปุ่มกลับค่าตั้งต้นกดไม่ได้พร้อมเหตุผล",
    JSON.stringify(back.sel.keys) === '["Ctrl+A"]' && back.redo.keys.length === 2 && !back.sel.custom && Object.keys(back.sv).length === 0 && back.btn === "true", JSON.stringify(back));
  // คีย์ตั้งเองที่เป็นตัวอักษรเดี่ยว ไม่ทำงานตอนพิมพ์ในช่อง แม้คำสั่งใช้ตอนพิมพ์ได้
  const ty = await mod(p, "/src/lib/keymap.ts", `return [m.typingKey("KeyQ"), m.typingKey("Shift+KeyQ"), m.typingKey("Ctrl+KeyQ"), m.typingKey("F3"), m.typingKey("Numpad5"), m.typingKey("Enter")];`);
  check("162.3 แยกคีย์พิมพ์ได้ถูก Q กับ Shift+Q และ Enter เป็นคีย์พิมพ์ ส่วน Ctrl+Q F3 Num 5 ไม่ใช่", JSON.stringify(ty) === "[true,true,false,false,false,true]", JSON.stringify(ty));
  // กล่อง ⓘ ของหัวข้อตัดบรรทัดตามความหมาย
  await click(p, '[data-info="คีย์ลัด"]'); await p.waitForSelector('[data-tip="คีย์ลัด"]'); await wait(p, 300);
  const lines = await linesOf((code) => p.evaluate(`(async () => { ${code} })()`), '[data-tip="คีย์ลัด"]');
  if (process.env.DUMP) console.log(JSON.stringify(lines, null, 1));
  check("162.3 กล่อง ⓘ คีย์ลัดตัดบรรทัดตามที่ตรวจไว้", !!lines && JSON.stringify(lines) === JSON.stringify(TIP_LINES.keys), JSON.stringify(lines));
  await p.keyboard.press("Escape"); await wait(p, 200);
  await click(p, '[data-info="ทำไมปรับไม่ได้"]'); await p.waitForSelector('[data-tip="ทำไมปรับไม่ได้"]'); await wait(p, 300);
  const fl = await linesOf((code) => p.evaluate(`(async () => { ${code} })()`), '[data-tip="ทำไมปรับไม่ได้"]');
  if (process.env.DUMP) console.log(JSON.stringify(fl, null, 1));
  check("162.3 กล่อง ⓘ คีย์พื้นฐานที่ปรับไม่ได้ตัดบรรทัดตามที่ตรวจไว้", !!fl && JSON.stringify(fl) === JSON.stringify(TIP_LINES.fixed), JSON.stringify(fl));
};

// 162.8 กดยกเลิกได้ตอนเปิดซับรูปจากหนังยาว (ผู้ช่วยตรวจทาน R23) ------------------------------------------
const IMG_MOVIE = "D:\\หนัง\\ซับรูปตัวอย่าง (2024).mkv"; // ซับรูป PGS ตัวอย่าง (OCR_PATH ใน theme-live-app.html)
const CANCEL_MSG = "ยกเลิกการเปิดซับรูปแล้ว";
/** คำสั่งเปิดซับรูปค้างจนกดยกเลิก แล้วตอบแบบที่ฝั่ง Rust ตอบ */
const hang = (p, cmd) => over(p, cmd, `window.__hangN = (window.__hangN || 0) + 1; return new Promise((_, rej) => { (window.__hangRej ??= []).push(rej); });`);
const cancelCmd = (p) => over(p, "sub_images_cancel", `window.__cancelN = (window.__cancelN || 0) + 1; for (const r of window.__hangRej ?? []) r(${JSON.stringify(CANCEL_MSG)}); window.__hangRej = []; return null;`);
const unhang = (p, cmd) => p.evaluate((c) => { delete window.__fxOver[c]; }, cmd);
T[8] = async (p, check) => {
  // ตัวดูซับรูป
  await hang(p, "sub_images"); await cancelCmd(p);
  await nav(p, "ซับไตเติล"); await wait(p, 300); await p.evaluate((x) => window.__subOpen(x), IMG_MOVIE);
  await p.waitForSelector("[data-simg-cancel]", { timeout: 8000 });
  // กดด้วยเมาส์จริง ตารางภาพหายแล้วจำนวนภาพต่อหน้าเปลี่ยน เดิมตัวดูขอภาพใหม่เองแล้วกลับไปอ่านต่อ
  await p.click("[data-simg-cancel]");
  await p.waitForSelector("[data-simg-cancelled]", { timeout: 5000 });
  const asked = await p.evaluate(() => window.__hangN);
  await wait(p, 1500);
  const v = await p.evaluate((a) => ({ n: window.__cancelN, again: window.__hangN - a, text: document.querySelector("[data-simg-cancelled]")?.innerText ?? "", prog: !!document.querySelector("[data-simg-progress]") }), asked);
  check("162.8 ตัวดูซับรูป กดยกเลิกระหว่างอ่าน เรียกคำสั่งยกเลิกแล้วขึ้นว่ายกเลิกแล้ว ไม่ขึ้นว่าถอดไม่ได้ และไม่ขอภาพใหม่เอง", v.n === 1 && v.again === 0 && v.text.includes(CANCEL_MSG) && !v.text.includes("ถอดซับรูปไม่ได้") && !v.prog, JSON.stringify(v));
  await unhang(p, "sub_images");
  await click(p, "[data-simg-retry]");
  await p.waitForSelector("[data-simg-list] [data-simg-at]", { timeout: 8000 });
  const back = await p.evaluate(() => ({ cancelled: !!document.querySelector("[data-simg-cancelled]"), imgs: document.querySelectorAll("[data-simgview] img").length }));
  check("162.8 ตัวดูซับรูป กดเปิดใหม่แล้วขึ้นภาพ", !back.cancelled && back.imgs > 0, JSON.stringify(back));
  // หน้า OCR
  await p.reload(); await p.waitForSelector("[data-navbar]"); await wait(p, 1500);
  await hang(p, "ocr_source"); await cancelCmd(p);
  await nav(p, "ซับไตเติล"); await wait(p, 300); await p.evaluate((x) => window.__subOpen(x), IMG_MOVIE); await wait(p, 2500);
  await clickText(p, "ดูซับ"); await wait(p, 300); await clickText(p, "OCR เป็นตัวหนังสือ", "button,[role=option],li");
  await p.waitForSelector("[data-ocr-open-cancel]", { timeout: 8000 });
  await p.click("[data-ocr-open-cancel]");
  await p.waitForSelector("[data-ocr-open-cancelled]", { timeout: 5000 });
  const o = await p.evaluate(() => ({ n: window.__cancelN, text: document.querySelector("[data-ocr-open-cancelled]")?.innerText ?? "" }));
  check("162.8 หน้า OCR กดยกเลิกระหว่างเปิด ขึ้นว่ายกเลิกแล้ว ไม่ขึ้นว่าเปิดไม่ได้", o.n === 1 && o.text.includes(CANCEL_MSG) && !o.text.includes("เปิดซับรูปไม่ได้"), JSON.stringify(o));
  await unhang(p, "ocr_source");
  await click(p, "[data-ocr-open-retry]");
  await p.waitForFunction(() => { const s = document.querySelector("[data-ocr-page]"); return s && s.getAttribute("aria-busy") !== "true" && !document.querySelector("[data-ocr-open-cancelled]"); }, null, { timeout: 8000 });
  check("162.8 หน้า OCR กดเปิดใหม่แล้วเปิดซับได้", true, "");
};

// ---------------------------------------------------------------- ตัวรัน
const want = process.argv.slice(2).map(Number).filter(Boolean);
const ids = Object.keys(T).map(Number).filter((n) => !want.length || want.includes(n)).sort((a, b) => a - b);
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : `  →  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`); };
let vite = null;
if (!(await up())) {
  vite = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "--port", "1420", "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}
const { chromium } = createRequire(import.meta.url)("playwright");
const b = await chromium.launch();
try {
  for (const n of ids) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(URL); await p.waitForSelector("[data-navbar]"); await wait(p, 1500);
    // ตัวเดิมของคำสั่งที่สลับ เรียกจากตัวสลับได้ (window.__fxOverBase)
    await p.evaluate(() => { window.__fxOverBase = new Proxy({}, { get: (_, c) => (a) => { const o = window.__fxOver; window.__fxOver = undefined; const r = window.__TAURI_INTERNALS__.invoke(c, a); window.__fxOver = o; return r; } }); });
    try { await T[n](p, check); } catch (e) { check(`${n} ตรวจจบไม่ได้`, false, e.message.split("\n")[0]); }
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/ข้อ-${n}.png` }).catch(() => {});
    if (errs.length) check(`${n} ไม่มีข้อผิดพลาดในหน้า`, false, errs.join(" | "));
    await p.close();
  }
} finally { await b.close(); vite?.kill(); }
console.log(`\nผ่าน ${pass} ตก ${fail}`);
process.exit(fail ? 1 : 0);
