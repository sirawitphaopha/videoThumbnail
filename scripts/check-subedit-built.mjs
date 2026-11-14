// หน้าแก้ซับกับตัวโปรแกรมที่สร้างจริง ใต้กติกาความปลอดภัย CSP (แผนหน้าแก้ซับ ขั้น 10) · ใช้: เปิด scripts/dev-app.ps1 -Built ก่อน แล้ว node scripts/check-subedit-built.mjs
// โหมดพัฒนาไม่ใช้ CSP ตัวจริง (CLAUDE.md TECH-REVIEW ข้อ 5) ภาพหรือเสียงที่โหลดผ่านในโหมดพัฒนาอาจโดนกันในตัวจริง
// ตรวจ ภาพหนังทีละเฟรมขึ้น เดินหน้าทีละเฟรมได้ คลื่นเสียงวาดได้ เล่นเสียงได้ (ความดังศูนย์ ไม่มีเสียงออกลำโพง) แบบ notepad รายชื่อฟอนต์ หน้าต่างถามสองทาง
// ไม่มีการละเมิด CSP ระหว่างทั้งหมด · ไม่เขียนไฟล์ · ตัวจริงไม่มีทางลัดของโหมดพัฒนา (__vidLib __audioNow) ใช้แค่ __subOpen __subEdit ที่มีในตัวจริง
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const MOVIE = resolve("test-media", "สร้าง", "แก้ซับ", "ฉากตัด (2025).mkv").replace(/\\/g, "/");
const SHOT = "docs/report-2026-11-14/แก้ซับ-ขั้น10";
mkdirSync(SHOT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
// แถวในตารางที่เวลาเริ่มตรงกับที่ส่งมา (คอลัมน์ที่ 3) · ตัวจริงไม่มี __subEdit ทุกอย่างกดผ่านหน้าจอ
const ROW = (t) => `[...document.querySelectorAll('[data-sub-table] tbody tr')].find((x) => x.cells[2]?.innerText.trim() === ${JSON.stringify(t)})`;
const typeIn = (sel, js) => `const el = document.querySelector(${JSON.stringify(sel)}); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, ${js}); el.dispatchEvent(new Event('input', { bubbles: true }));`;
const dirty = "return (document.querySelector('[data-se-state]')?.innerText ?? '').includes('แก้แล้ว');";

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  check("เป็นตัวโปรแกรมที่สร้างจริง ไม่ใช่โหมดพัฒนา", await q("return !location.href.startsWith('http://localhost:1420') && !window.__vidLib;"), await q("return location.href;"));
  await q(`try { localStorage.setItem('se-aud', JSON.stringify({ link: false, volume: 0 })); localStorage.setItem('se-fold', '0'); localStorage.setItem('se-vauto', '1'); } catch {} return 1;`);
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  // จดการละเมิด CSP ทุกครั้งตั้งแต่ตอนนี้ · จดว่าเสียงเริ่มเล่นจริง (AudioBufferSourceNode.start) โดยไม่แตะโค้ดของโปรแกรม
  await q(`window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI));
    window.__played = 0; const st = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { window.__played++; return st.apply(this, a); }; return 1;`);
  await q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === 'ซับไตเติล')?.click(); return 1;`);
  await sleep(400);
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(MOVIE)}); return 1;`);
  check("เปิดหนังทดสอบ หน้าแก้ซับขึ้น", await waitFor("return !!document.querySelector('[data-se-cmds]')", 30000));
  // ตารางเลือกแถวตอนกดเมาส์ลง (onMouseDown) element.click() ไม่พอ ต้องกดด้วยเมาส์ผ่าน CDP
  await c.click(`[data-sub-table] tr[data-id="${await q(`return ${ROW("0:00:04.10")}.dataset.id;`)}"]`);
  check("ภาพหนังของบรรทัดที่เลือกขึ้น", await waitFor("const i = document.querySelector('[data-vframe] img'); return !!i && i.complete && i.naturalWidth > 0;", 20000), await q("const i = document.querySelector('[data-vframe] img'); return i ? i.src.slice(0, 40) : 'ไม่มีภาพ';"));
  const pos0 = await q("return document.querySelector('[data-vpos]')?.innerText ?? '';");
  await c.click("[data-vnext]");
  await sleep(800);
  const pos1 = await q("return document.querySelector('[data-vpos]')?.innerText ?? '';");
  check("ปุ่มเดินหน้าหนึ่งเฟรม เวลาของภาพเปลี่ยน ภาพยังขึ้น", pos0 !== pos1 && (await q("const i = document.querySelector('[data-vframe] img'); return i.complete && i.naturalWidth > 0;")), `${pos0} → ${pos1}`);
  const wave = await q("const cv = document.querySelector('canvas[data-aud]'); if (!cv) return -1; const g = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < g.length; i += 16) if (g[i] > 0) n++; return n;");
  check("คลื่นเสียงวาดได้ (อ่านพิกเซลของกรอบเสียงได้ ไม่มีจุดว่างทั้งกรอบ)", wave > 100, String(wave));
  await c.click("[data-se-ab=playline]");
  check("กดเล่นบรรทัด เสียงเริ่มเล่นจริง (ความดังศูนย์)", await waitFor("return window.__played > 0;", 10000), await q("return String(window.__played);"));
  await c.click("[data-se-ab=stop]").catch(() => {});
  await c.shot(`${SHOT}/1-ตัวจริง-หน้าหลัก-1280x800.png`);
  // แบบ notepad (subdoc_render) · รายชื่อฟอนต์ (font_families)
  await q("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'แบบ notepad')?.click(); return 1;");
  check("แบบ notepad ข้อความทั้งไฟล์ขึ้น", await waitFor("return (document.querySelector('[data-pad-text]')?.value ?? '').includes('[Events]');", 8000));
  await q("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'แบบ Aegisub')?.click(); return 1;"); await sleep(500);
  await q("document.querySelector('[data-se-fn]')?.click(); return 1;");
  check("หน้าต่างเลือกฟอนต์ รายชื่อฟอนต์ในเครื่องขึ้น", await waitFor("return document.querySelectorAll('[data-font-dialog] [data-font]').length > 3;", 8000), await q("return String(document.querySelectorAll('[data-font-dialog] [data-font]').length);"));
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  check("Esc ปิดหน้าต่างเลือกฟอนต์", await waitFor("return !document.querySelector('[data-font-dialog]');", 3000));
  // หน้าต่างถามสองทาง (merge_inspect) แก้หนึ่งบรรทัดแล้วกดบันทึก ไม่กดใส่กลับเข้าหนัง แล้วเลิกทำ
  await q(`${typeIn("[data-se-text]", "'ทดสอบตัวจริง'")} return 1;`);
  await waitFor(dirty, 4000);
  await q("document.querySelector('[data-sub-table]').focus(); return 1;");
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "s", code: "KeyS", modifiers: 2, windowsVirtualKeyCode: 83 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "s", code: "KeyS", modifiers: 2, windowsVirtualKeyCode: 83 });
  check("กดบันทึกซับในหนัง หน้าต่างถามสองทางอ่านแทร็กของหนังได้", await waitFor("return /^แทร็กที่ \\d+ ครบทุกช่อง ภาษาไทย แบบ ASS$/.test(document.querySelector('[data-remux-track]')?.innerText ?? '');", 10000),
    await q("return JSON.stringify({ dlg: !!document.querySelector('[data-remux]'), track: document.querySelector('[data-remux-track]')?.innerText ?? null, err: document.querySelector('[data-remux] .bad')?.innerText ?? null, state: document.querySelector('[data-se-state]')?.innerText ?? '', active: document.activeElement?.tagName + ' ' + (document.activeElement?.className ?? '') });"));
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(300);
  check("Esc ปิดหน้าต่างถามสองทาง ไม่รวมไฟล์", await q("return !document.querySelector('[data-remux]');"));
  // Ctrl+Shift+S บันทึกเป็นไฟล์ใหม่ (ตัวจริงกันคีย์ลัดของเบราว์เซอร์ Ctrl+S ไว้ คีย์ลัดของโปรแกรมต้องยังทำงาน · browserKeys.ts)
  await q("document.querySelector('[data-sub-table]').focus(); return 1;");
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "S", code: "KeyS", modifiers: 10, windowsVirtualKeyCode: 83 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "S", code: "KeyS", modifiers: 10, windowsVirtualKeyCode: 83 });
  check("Ctrl+Shift+S เปิดหน้าต่างบันทึกเป็นไฟล์ใหม่", await waitFor("return !!document.querySelector('[data-se-saveas-path]');", 5000));
  await q("[...document.querySelectorAll('.dlg .btn-ghost')].find((b) => b.innerText === 'ยกเลิก')?.click(); return 1;"); await sleep(300);
  await c.click("[data-se-undo]"); await sleep(300);
  check("กดเลิกทำแล้วไม่มีงานค้าง", !(await q(dirty)), await q("return document.querySelector('[data-se-state]')?.innerText ?? '';"));
  // ความเร็วแบบ notepad กับไฟล์ซับ 2,000 บรรทัด (ค้างจากขั้น 8) · วาดข้อความทั้งไฟล์ แล้วพิมพ์แก้หนึ่งคำ วัดจนเอกสารเปลี่ยน (รวมพักพิมพ์ 500 ms)
  const LONG = resolve("test-media", "สร้าง", "แก้ซับ", "ยาว 2000 บรรทัด.th.srt").replace(/\\/g, "/");
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(LONG)}); return 1;`);
  await waitFor("return !!document.querySelector('[data-se-cmds]') && document.querySelector('[data-subedit]').innerText.includes('2,000 บรรทัด');", 30000);
  await q("window.__long = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(Math.round(e.duration)))).observe({ type: 'longtask', buffered: false }); window.__t0 = performance.now(); [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'แบบ notepad')?.click(); return 1;");
  await waitFor("return (document.querySelector('[data-pad-text]')?.value.length ?? 0) > 1000;", 20000);
  const tRender = await q("return Math.round(performance.now() - window.__t0);");
  // บรรทัดที่ 3 ของไฟล์ SRT คือข้อความของบล็อกแรก
  const first = await q("return document.querySelector('[data-pad-text]').value.split('\\n')[2];");
  await q(`window.__t1 = performance.now(); ${typeIn("[data-pad-text]", `document.querySelector('[data-pad-text]').value.replace(${JSON.stringify(first)}, ${JSON.stringify(first + " แก้")})`)} return 1;`);
  await waitFor(dirty, 20000);
  const tCommit = await q("return Math.round(performance.now() - window.__t1);");
  const longest = await q("return Math.max(0, ...window.__long);");
  check(`notepad กับไฟล์ 2,000 บรรทัด วาดข้อความ ${tRender} ms แก้แล้วเอกสารเปลี่ยนใน ${tCommit} ms (รวมพักพิมพ์ 500 ms) งานยาวสุด ${longest} ms`, tRender < 3000 && tCommit < 3000 && longest < 500);
  await q("[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'แบบ Aegisub')?.click(); return 1;"); await sleep(300);
  await c.click("[data-se-undo]"); await sleep(300);
  check("ที่แก้ในแบบ notepad ขึ้นในตาราง กดเลิกทำครั้งเดียวกลับเหมือนเดิม", !(await q(dirty)) && (await q(`return !document.querySelector('[data-sub-table]').innerText.includes(${JSON.stringify(first + " แก้")});`)));
  const csp = await q("return window.__csp;");
  check("ไม่มีการละเมิด CSP ตลอดการตรวจ", Array.isArray(csp) && csp.length === 0, JSON.stringify(csp));
} finally {
  await q("try { window.__subClear(); } catch {} return 1;").catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  c.close();
}
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length} ข้อ`);
process.exit(ok === results.length ? 0 : 1);
