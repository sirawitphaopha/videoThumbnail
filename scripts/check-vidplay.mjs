// เล่นหนังในกรอบวิดีโอของหน้าแก้ซับ แบบ Aegisub (vidPlay.ts vidplay.rs · พี่กันขอ 14 พ.ย. 2569) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-vidplay.mjs
// กดเล่นแล้ว เสียงเล่นจริง (ความดังศูนย์) ภาพเดินตามเวลาของเสียง ผืนวาดมีภาพ ซับบนภาพเปลี่ยนตามเวลา · กดหยุดแล้วภาพนิ่งอยู่ที่เฟรมที่เห็น
// Ctrl+P เล่นหยุด · เล่นจนจบเรื่องหยุดเอง · เลือกบรรทัดตอนเล่นกับ AUTO เล่นต่อจากเวลาเริ่มของบรรทัดนั้น · ไม่เขียนไฟล์
import { mkdirSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const MOVIE = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv";
const SHOT = "docs/report-2026-11-14/เล่นวิดีโอ";
mkdirSync(SHOT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const S = "window.__subEdit";
const VP = "window.__vidPlay()";
const ctrlP = async () => {
  await q("document.querySelector('[data-sub-table]').focus(); return 1;");
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "p", code: "KeyP", modifiers: 2, windowsVirtualKeyCode: 80 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "p", code: "KeyP", modifiers: 2, windowsVirtualKeyCode: 80 });
};
const ink = "const cv = document.querySelector('[data-vplaycv]'); if (!cv || !cv.width) return -1; const g = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < g.length; i += 64) if (g[i] + g[i + 1] + g[i + 2] > 30) n++; return n;";

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  await q(`try { localStorage.setItem('se-aud', JSON.stringify({ link: false, volume: 0 })); localStorage.setItem('se-vauto', '1'); localStorage.setItem('se-fold', '0'); } catch {} return 1;`);
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  await q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === 'ซับไตเติล')?.click(); return 1;`);
  await sleep(300);
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(MOVIE)}); return 1;`);
  await waitFor("return !!document.querySelector('[data-se-cmds]') && !!window.__vidLib.rate()", 20000);
  await sleep(600);
  // บรรทัด A (0.50 ถึง 3.40) AUTO พาภาพไปเวลาเริ่ม
  await q(`const e = ${S}.get().doc.events.find((x) => x.start === 500 && !x.comment); ${S}.select([e.id], e.id); return 1;`);
  await waitFor("return window.__vidLib.get().pos === window.__vidLib.rate().frameAt(500, 'start');", 5000);
  const p0 = await q("return window.__vidLib.get().pos;");
  check("ปุ่มเล่นอยู่แถบใต้ภาพ กดได้", await q("const b = document.querySelector('[data-vplay]'); return !!b && !b.getAttribute('aria-disabled');"));
  await c.click("[data-vplay]");
  check("กดเล่นแล้วเสียงดัง (ความดังศูนย์) ภาพเริ่มเดิน", await waitFor(`return window.__audioNow().playing && ${VP}.playing && ${VP}.frame > ${p0};`, 8000), JSON.stringify(await q(`return ${VP};`)));
  await sleep(1500);
  const a = await q(`const v = ${VP}, au = window.__audioNow(), fr = window.__vidLib.rate(); return { frame: v.frame, want: fr.frameAt(au.now ?? 0), now: Math.round(au.now ?? 0), queue: v.queue };`);
  check("ภาพตรงกับเวลาของเสียง คลาดไม่เกิน 3 เฟรม", Math.abs(a.frame - a.want) <= 3, JSON.stringify(a));
  check("ผืนวาดมีภาพหนัง", (await q(ink)) > 50, String(await q(ink)));
  check("ปุ่มเปลี่ยนเป็นหยุด ช่องเวลาบอกเฟรมที่กำลังเล่น", await q(`return document.querySelector('[data-vplay]').getAttribute('aria-pressed') === 'true' && document.querySelector('[data-vpos]').innerText.endsWith(' - ' + ${VP}.frame);`));
  await c.shot(`${SHOT}/1-กำลังเล่น.png`, "[data-vbox]", 6);
  // ซับบนภาพเปลี่ยนตามเวลา เล่นถึงบรรทัด B (4.10) ซับขึ้นข้อความของ B
  const subA = await q("return document.querySelector('[data-vframe] .vsub')?.innerText ?? '';");
  await waitFor("return (window.__audioNow().now ?? 0) > 4300;", 8000);
  await sleep(200);
  const subB = await q("return document.querySelector('[data-vframe] .vsub')?.innerText ?? '';");
  check("ซับบนภาพเปลี่ยนตามเวลาที่เล่น", subA.includes("สวัสดี") && subB.includes("ฉากที่สอง"), `${subA.split("\n")[0]} → ${subB.split("\n")[0]}`);
  // หยุด
  await c.click("[data-vplay]");
  await sleep(500);
  const st = await q(`return { playing: ${VP}.playing, audio: window.__audioNow().playing, pos: window.__vidLib.get().pos, img: !!document.querySelector('[data-vframe] img'), cv: !!document.querySelector('[data-vplaycv]') };`);
  check("กดหยุด เสียงหยุด ภาพนิ่งอยู่ที่เฟรมที่เล่นถึง", !st.playing && !st.audio && st.pos > p0 && !st.cv && st.img, JSON.stringify(st));
  // Ctrl+P
  await ctrlP();
  check("Ctrl+P เล่น", await waitFor(`return ${VP}.playing;`, 3000));
  await sleep(600);
  await ctrlP();
  check("Ctrl+P อีกครั้งหยุด", await waitFor(`return !${VP}.playing && !window.__audioNow().playing;`, 3000));
  // เลือกบรรทัดตอนเล่น AUTO เล่นต่อจากบรรทัดนั้น
  await c.click("[data-vplay]");
  await waitFor(`return ${VP}.playing && ${VP}.frame > window.__vidLib.get().pos;`, 6000);
  await q(`const e = ${S}.get().doc.events.find((x) => x.start === 12000); ${S}.select([e.id], e.id); return 1;`);
  const f12 = await q("return window.__vidLib.rate().frameAt(12000, 'start');");
  check("เลือกบรรทัดตอนเล่น เล่นต่อจากเวลาเริ่มของบรรทัดนั้น", await waitFor(`return ${VP}.playing && ${VP}.frame >= ${f12} && ${VP}.frame < ${f12} + 48;`, 8000), JSON.stringify(await q(`return ${VP};`)));
  // เล่นจนจบเรื่อง หยุดเอง (หนังทดสอบยาวราว 20 วินาที เริ่มที่ 19 วินาที)
  await c.click("[data-vplay]"); await sleep(300);
  const last = await q("return window.__vidLib.rate().count - 1;");
  await q(`window.__vidLib.seek(${last} - 24); return 1;`); await sleep(400);
  await c.click("[data-vplay]");
  check("เล่นจนจบเรื่องแล้วหยุดเอง ภาพอยู่ใกล้เฟรมสุดท้าย", await waitFor(`return !${VP}.playing;`, 8000) && (await q(`return window.__vidLib.get().pos >= ${last} - 3;`)), JSON.stringify(await q(`return { ...${VP}, pos: window.__vidLib.get().pos, last: ${last} };`)));
  // เล่นเสียงอย่างอื่นตอนภาพเล่นอยู่ ภาพหยุดตาม
  await q(`window.__vidLib.seek(24); return 1;`); await sleep(300);
  await c.click("[data-vplay]");
  await waitFor(`return ${VP}.playing && window.__audioNow().playing;`, 5000);
  await c.click("[data-se-ab=playline]");
  check("กดเล่นเสียงของบรรทัดตอนหนังเล่นอยู่ ภาพหยุดเล่น", await waitFor(`return !${VP}.playing;`, 4000));
  await c.click("[data-se-ab=stop]").catch(() => {});
  // หนังภาพ HEVC (ตัววาดหน้าจอถอดเองไม่ได้) เปิดไฟล์ซับแล้วใส่หนังนี้เป็นวิดีโอ กดเล่น ภาพต้องเดิน
  const HEVC = "D:/movie-shelf/test-media/สร้าง/หนัง/HEVC Test (2020).mkv";
  await q(`window.__subClear(); window.__subOpen("D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).th.ass"); return 1;`);
  await waitFor("return !!document.querySelector('[data-se-cmds]');", 15000);
  await q(`window.__subVideo(${JSON.stringify(HEVC)}); return 1;`);
  await waitFor("return !!window.__vidLib.rate() && window.__vidLib.get().pos != null;", 30000);
  await sleep(500);
  const h0 = await q("return window.__vidLib.get().pos;");
  await c.click("[data-vplay]");
  const hv = await waitFor(`return ${VP}.playing && ${VP}.frame > ${h0} + 24;`, 10000);
  check("หนังภาพ HEVC เล่นได้ ภาพเดินเกิน 24 เฟรม", hv && (await q(ink)) > 50, JSON.stringify({ ...(await q(`return ${VP};`)), codec: await q("return window.__vidLib.get().table?.codec;") }));
  await c.shot(`${SHOT}/2-หนัง-HEVC.png`, "[data-vbox]", 6);
  await c.click("[data-vplay]");
} finally {
  await q(`try { window.__vidPlayStop?.(); localStorage.setItem('se-vauto', '1'); } catch {} return 1;`).catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  c.close();
}
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length} ข้อ`);
process.exit(ok === results.length ? 0 : 1);
