// ตัวตรวจบั๊กชุด 2 ข้อ 9 (docs/BUGS.md จัดหมวด 11 พ.ย. 2569) · เลือกของในแต่ละหน้า สลับเมนู แล้วกลับมาต้องอยู่ครบ
// หน้าที่ซ่อนอยู่ต้องไม่รับไฟล์ที่ลากมาลงหน้าอื่น (ส่งเหตุการณ์ลากไฟล์ของ Tauri จริง ทุกหน้าที่ฟังอยู่ได้รับ)
// เปิดโปรแกรมโหมดพัฒนาก่อน (scripts/dev-app.ps1) · ไม่กดปุ่มเลือกไฟล์ บันทึก หรือเปิดเบราว์เซอร์ · ไฟล์หนังเป็นสำเนาใน D:\dev\tmp\ชั้นชุด2
// ข้อ 28 ทำงานเฉพาะตัวจริง ตรวจด้วย --built (เปิดตัวจริงด้วย scripts/dev-app.ps1 -Built ก่อน)
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync, copyFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const BUILT = process.argv.includes("--built");
const ROOT = "D:/movie-shelf";
const OUT = `${ROOT}/docs/report-2026-11-11/ชุด2`; mkdirSync(OUT, { recursive: true });
const DIR = "D:\\dev\\tmp\\ชั้นชุด2"; rmSync(DIR, { recursive: true, force: true }); mkdirSync(DIR, { recursive: true });
const PMOVIE = join(DIR, "The Last Orchard (2022).mp4"); copyFileSync(`${ROOT}/test-media/สร้าง/หนัง/The Last Orchard (2022).mp4`, PMOVIE);
const AVM = join(DIR, "ดาวตก (2024).mkv"); copyFileSync(`${ROOT}/test-media/สร้าง/เสียงซับ/ดาวตก (2024).mkv`, AVM);
const POSTER = `${ROOT}/test-media/สร้าง/รูป/poster.jpg`;
const SONG = `${ROOT}/test-media/สร้าง/เสียงซับ/เพลงทดสอบ 96k.flac`;
const VID = "D:/dev/tmp/ชั้นบิตเรต/ตัวอย่างหนัง (2026).mkv";

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const waitFor = async (js, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await q(js)) return true; } catch { /* หน้ายังโหลด */ } await sleep(150); } return false; };
const nav = async (label) => { await q(`[...document.querySelectorAll("button,a")].find(b => b.innerText.trim().split(/\\s*\\n/)[0] === ${JSON.stringify(label)})?.click()`); await sleep(500); };
const vis = (id) => `(document.querySelector('[data-pageslot=${id}]')?.style.display === 'contents')`;
const tauriDrop = (paths, x = 700, y = 400) => c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: ${JSON.stringify(paths)}, position: { x: ${x}, y: ${y} } } })`);
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

if (BUILT) {
  /* ---------- ข้อ 28 ตัวจริง ไม่มีเมนูคลิกขวาของเบราว์เซอร์ ปุ่มรีเฟรชไม่ทำงาน ---------- */
  await waitFor("return !!document.querySelector('.main')", 30000);
  const r = await q(`const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); document.querySelector('.main').dispatchEvent(ev); const inp = document.createElement('input'); document.body.appendChild(inp); const ev2 = new MouseEvent('contextmenu', { bubbles: true, cancelable: true }); inp.dispatchEvent(ev2); inp.remove(); return { page: ev.defaultPrevented, input: ev2.defaultPrevented }`);
  check("ข้อ 28 คลิกขวาบนหน้าโปรแกรม เมนูของเบราว์เซอร์ถูกกัน · ในช่องพิมพ์ยังคลิกขวาได้", r.page && !r.input, JSON.stringify(r));
  await q(`window.__reloadMark = 1`);
  for (const [key, code, vk, mods] of [["F5", "F5", 116, 0], ["r", "KeyR", 82, 2], ["p", "KeyP", 80, 2], ["s", "KeyS", 83, 2]]) {
    await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await sleep(900);
  }
  const still = await q(`return window.__reloadMark === 1`).catch(() => false);
  check("ข้อ 28 กด F5 Ctrl+R Ctrl+P Ctrl+S แล้วหน้าไม่รีเฟรช (ค่าที่ฝากไว้ในหน้ายังอยู่)", still);
  console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
  process.exit(fail ? 1 : 0);
}

await c.evaluate("location.hash = ''; location.reload()"); await sleep(3000);

/* ---------- ใส่โปสเตอร์ ---------- */
await nav("ใส่โปสเตอร์");
const pdrop = (path, zone) => c.evaluate(`(() => { const r = document.querySelector('[data-drop=${zone}]').getBoundingClientRect(); window.__posterDrop([${JSON.stringify(path)}], (r.left + 20) * devicePixelRatio, (r.top + 20) * devicePixelRatio); })()`);
await pdrop(PMOVIE, "movie"); await waitFor(`return (document.querySelector('[data-card=movie]')?.innerText ?? '').includes('The Last Orchard')`, 20000);
await pdrop(POSTER, "poster"); await waitFor("return !!document.querySelector('[data-use]')", 20000); await sleep(800);
await q(`document.querySelector('[data-use]').click()`); await waitFor(`return !document.querySelector('[data-crop]') && (document.querySelector('[data-card=poster]')?.innerText ?? '').length > 0`, 20000); await sleep(500);
const p0 = await q(`return { movie: document.querySelector('[data-card=movie]')?.innerText.replace(/\\s+/g, ' ').slice(0, 60), poster: document.querySelector('[data-card=poster]')?.innerText.replace(/\\s+/g, ' ').slice(0, 60) }`);
await nav("ตรวจไฟล์"); await sleep(300);
check("ไปเมนูตรวจไฟล์แล้ว หน้าใส่โปสเตอร์ซ่อน ไม่ได้ถอดทิ้ง", await q(`return !${vis("poster")} && !!document.querySelector('[data-pageslot=poster] [data-poster-page]')`));
// ลากรูปมาวางตอนอยู่หน้าเสียงและซับ หน้าใส่โปสเตอร์ที่ซ่อนอยู่ต้องไม่รับ
await nav("เสียงและซับ");
await tauriDrop([AVM]); await waitFor("return document.querySelectorAll('[data-pageslot=av] .trk:not(.head)').length > 2", 30000);
const av0 = await q(`return [...document.querySelectorAll('[data-pageslot=av] .trk:not(.head) .ft')].map(f => f.innerText).join(' ')`);
await nav("ใส่โปสเตอร์");
const p1 = await q(`return { movie: document.querySelector('[data-card=movie]')?.innerText.replace(/\\s+/g, ' ').slice(0, 60), poster: document.querySelector('[data-card=poster]')?.innerText.replace(/\\s+/g, ' ').slice(0, 60) }`);
check("ข้อ 9 หน้าใส่โปสเตอร์ ไปเมนูอื่นแล้วกลับมา ไฟล์หนังกับรูปอยู่ครบ · ลากหนังลงหน้าเสียงและซับ หน้าใส่โปสเตอร์ที่ซ่อนอยู่ไม่รับ", p1.movie === p0.movie && p1.poster === p0.poster && /Orchard/.test(p1.movie ?? ""), `${JSON.stringify(p0)} → ${JSON.stringify(p1)}`);
await c.shot(`${OUT}/09-ใส่โปสเตอร์กลับมาอยู่ครบ.png`, ".main", 0);

/* ---------- เสียงและซับ ---------- */
await nav("กราฟเสียง");
await tauriDrop([SONG]); await waitFor(`return (document.querySelector('[data-pageslot=graph] .fchip .nm')?.innerText ?? '').startsWith('เพลงทดสอบ 96k')`, 20000); await sleep(1500);
await nav("เสียงและซับ");
const av1 = await q(`return [...document.querySelectorAll('[data-pageslot=av] .trk:not(.head) .ft')].map(f => f.innerText).join(' ')`);
check("ข้อ 9 หน้าเสียงและซับ ไปเมนูอื่นแล้วกลับมา แทร็กอยู่ครบ · ลากเพลงลงหน้ากราฟ หน้าเสียงและซับที่ซ่อนอยู่ไม่รับ", av1 === av0 && av1.length > 0, `${av0} → ${av1}`);
await c.shot(`${OUT}/09-เสียงและซับกลับมาอยู่ครบ.png`, ".main", 0);

/* ---------- กราฟเสียง ---------- */
await nav("บิตเรต"); await q(`window.__bitrateView('new')`); await sleep(400);
await q(`window.__brnOpen(${JSON.stringify(VID)})`); await sleep(1500); await q(`document.querySelector('[data-brnpick="v"]')?.click()`);
await waitFor(`return !document.querySelector('[data-brnprog]') && /เฉลี่ย\\s+\\d/.test(document.querySelector('.brn-side')?.innerText ?? '')`, 90000);
const br0 = await q(`return document.querySelector('[data-pageslot=bitrate] .fchip .nm')?.innerText.replace(/\\s+/g, ' ').slice(0, 60)`);
await nav("กราฟเสียง");
const g1 = await q(`return document.querySelector('[data-pageslot=graph] .fchip .nm')?.innerText`);
check("ข้อ 9 หน้ากราฟเสียง ไปเมนูอื่นแล้วกลับมา ไฟล์ที่เปิดอยู่ครบ", (g1 ?? "").startsWith("เพลงทดสอบ 96k"), g1);
await c.shot(`${OUT}/09-กราฟเสียงกลับมาอยู่ครบ.png`, ".main", 0);

/* ---------- บิตเรต ---------- */
await nav("บิตเรต"); await sleep(400);
const br1 = await q(`return document.querySelector('[data-pageslot=bitrate] .fchip .nm')?.innerText.replace(/\\s+/g, ' ').slice(0, 60)`);
const side = await q(`return /เฉลี่ย\\s+\\d/.test(document.querySelector('[data-pageslot=bitrate] .brn-side')?.innerText ?? '')`);
check("ข้อ 9 หน้าบิตเรต ไปเมนูอื่นแล้วกลับมา ไฟล์กับกราฟอยู่ครบ ไม่ต้องอ่านใหม่", br1 === br0 && side && !(await q(`return !!document.querySelector('[data-brnprog]')`)), `${br0} → ${br1}`);

/* ---------- ตั้งค่า ---------- */
await nav("ตั้งค่า"); await c.setNav("thanks");
await q(`const s = document.querySelector('[data-setcard=thanks]'); let p = s; while (p && getComputedStyle(p).overflowY !== 'auto') p = p.parentElement; p.scrollTop = 400;`); await sleep(200);
await nav("ชั้นวางหนัง"); await nav("ตั้งค่า");
const st = await q(`const s = document.querySelector('[data-setcard=thanks]'); let p = s; while (p && getComputedStyle(p).overflowY !== 'auto') p = p.parentElement; return { shown: !s.hidden, top: Math.round(p.scrollTop) }`);
check("ข้อ 9 หน้าตั้งค่า ไปเมนูอื่นแล้วกลับมา หัวข้อเดิม ตำแหน่งเลื่อนเดิม", st.shown && st.top > 300, JSON.stringify(st));
await q(`const s = document.querySelector('[data-setcard=thanks]'); let p = s; while (p && getComputedStyle(p).overflowY !== 'auto') p = p.parentElement; p.scrollTop = 0;`);

/* ---------- หน้าซ่อนอยู่ไม่รับปุ่มลัด ---------- */
// หน้าบิตเรตกด Ctrl+G สลับเป็นต่อ GOP · อยู่หน้าตั้งค่าแล้วกด ต้องไม่สลับ
const mode0 = await q(`return [...document.querySelectorAll('[data-pageslot=bitrate] .brn-ctl .seg button.on')].map(b => b.innerText.trim()).join(',')`);
await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "g", code: "KeyG", windowsVirtualKeyCode: 71, modifiers: 2 });
await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "g", code: "KeyG", windowsVirtualKeyCode: 71, modifiers: 2 }); await sleep(400);
const mode1 = await q(`return [...document.querySelectorAll('[data-pageslot=bitrate] .brn-ctl .seg button.on')].map(b => b.innerText.trim()).join(',')`);
check("ข้อ 9 หน้าบิตเรตที่ซ่อนอยู่ไม่รับปุ่มลัด (กด Ctrl+G ตอนอยู่หน้าตั้งค่า)", mode0 === mode1, `${mode0} → ${mode1}`);

console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
process.exit(fail ? 1 : 0);
