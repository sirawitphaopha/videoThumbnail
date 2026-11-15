// AUDIT 12 พ.ย. 2569 ข้อ 36 พิมพ์คำที่ขึ้นต้นด้วย ไ ใ โ ในช่องค้นหาและช่องเปลี่ยนชื่อ หัวสระต้องไม่โดนตัดที่ขอบซ้าย
// วัดจากหมึกจริงของตัวอักษรตัวแรก (measureText actualBoundingBoxLeft ฟอนต์เดียวกับช่อง) เทียบขอบที่ชั้นวาดตัด (.sb-draw)
// และตัวหนังสือต้องเริ่มตรงกับช่องพิมพ์ ขีดกะพริบจึงอยู่ตรงตัวอักษร · เปิดโปรแกรมโหมดพัฒนาก่อน ไม่เปลี่ยนชื่อไฟล์จริง กดยกเลิกตอนจบ
// ภาพลง docs/report-2026-11-15/AUDIT-กลุ่ม3/
import { connect, sleep } from "./lib/cdp-client.mjs";
import { mkdirSync } from "node:fs";

const OUT = "D:/movie-shelf/docs/report-2026-11-15/AUDIT-กลุ่ม3"; mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " · " + extra : ""}`); };
const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const waitFor = async (js, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await q(js)) return true; } catch { /* หน้ากำลังโหลด */ } await sleep(150); } return false; };

// วัดช่องที่ input อยู่ใน .sb-field ตัวที่ sel ชี้ · ink = ขอบซ้ายของหมึกตัวแรก · clip = ขอบซ้ายที่ชั้นวาดตัด
const measure = (sel) => c.evaluate(`(async () => {
  await document.fonts.ready;
  const f = document.querySelector(${JSON.stringify(sel)}); if (!f) return null;
  const d = f.querySelector('.sb-draw'), s = d.querySelector('span'), i = f.querySelector('input');
  const cs = getComputedStyle(s), ctx = document.createElement('canvas').getContext('2d');
  ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
  const ch = (s.textContent || '').charAt(0), m = ctx.measureText(ch);
  const r = s.getBoundingClientRect(), dr = d.getBoundingClientRect(), ir = i.getBoundingClientRect();
  return { text: s.textContent, ch, over: +m.actualBoundingBoxLeft.toFixed(2), ink: +(r.left - m.actualBoundingBoxLeft).toFixed(2), clip: +dr.left.toFixed(2), start: +r.left.toFixed(2), input: +ir.left.toFixed(2) };
})()`);
const typeInto = async (sel, text) => {
  await q(`const i = document.querySelector(${JSON.stringify(sel)} + ' input'); i.focus(); i.select(); return 1`);
  await c.send("Input.insertText", { text }); await sleep(250);
};

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 3, mobile: false });
try {
  await q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.includes('ชั้นวางหนัง'))?.click(); return 1`);
  await waitFor("return !!document.querySelector('.book[data-movie]')");
  // ---------- ช่องค้นหาชั้นวาง ----------
  const SB = ".shelfhead .search .sb-field, .search .sb-field";
  for (const w of ["ไทย", "ใจ", "โรง"]) {
    await typeInto(SB, w);
    const m = await measure(SB);
    check(`ช่องค้นหา พิมพ์ ${w} หัวสระไม่โดนตัด ตัวหนังสือตรงช่องพิมพ์`, !!m && m.text === w && m.over > 0 && m.ink >= m.clip - 0.01 && Math.abs(m.start - m.input) < 0.5, JSON.stringify(m));
    if (w === "ไทย") await c.shot(`${OUT}/36-ช่องค้นหา-ไทย.png`, ".shelfhead .search, .search", 8);
  }
  await typeInto(SB, ""); await q(`document.querySelector(${JSON.stringify(SB)} + ' input')?.blur(); return 1`);
  await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape" }); await sleep(200);
  // ---------- ช่องเปลี่ยนชื่อในแผงขวา ----------
  await q("if (!document.querySelector('.book.sel')) document.querySelector('.book[data-movie]')?.click(); return 1"); await sleep(500);
  await q(`[...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'เปลี่ยนชื่อ' && b.getAttribute('aria-disabled') !== 'true')?.click(); return 1`);
  const RB = "[data-detail] .sb-field";
  if (await waitFor(`return !!document.querySelector(${JSON.stringify(RB)})`, 5000)) {
    for (const w of ["ไทย", "ใจ", "โรง"]) {
      await typeInto(RB, w);
      const m = await measure(RB);
      check(`ช่องเปลี่ยนชื่อ พิมพ์ ${w} หัวสระไม่โดนตัด ตัวหนังสือตรงช่องพิมพ์`, !!m && m.text.startsWith(w) && m.over > 0 && m.ink >= m.clip - 0.01 && Math.abs(m.start - m.input) < 0.5, JSON.stringify(m));
      if (w === "ใจ") await c.shot(`${OUT}/36-ช่องเปลี่ยนชื่อ-ใจ.png`, RB, 8);
    }
  } else check("เปิดช่องเปลี่ยนชื่อในแผงขวาได้", false);
} finally {
  // ยกเลิกการเปลี่ยนชื่อ ไม่แตะไฟล์จริง
  await q(`[...document.querySelectorAll('[data-detail] button')].find((b) => b.innerText.trim() === 'ยกเลิก')?.click(); return 1`);
  await c.send("Emulation.clearDeviceMetricsOverride", {});
}
console.log(`\nผ่าน ${pass} จาก ${pass + fail}`);
process.exit(fail ? 1 : 0);
