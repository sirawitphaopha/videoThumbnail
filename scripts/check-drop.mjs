// จุดลากไฟล์แบบที่พี่กันเลือก 9 พ.ย. 2569 บนโปรแกรมจริง ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-drop.mjs
// พื้นไล่โทน เส้นประเข้ม วงสีเดียว ทุกหน้าที่มีจุดลาก · ตอนลากค้างเด่นกว่าตอนรอ · แถวลากเพิ่มใต้คิวไม่มีวงใหญ่ · โทนอื่นวงตามโทน
import { mkdirSync, writeFileSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-09/จุดลากไฟล์";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push({ name, ok: !!ok, note: String(note) }); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = async (l) => { await q(`[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes(${JSON.stringify(l)})).click();`); await sleep(600); };
const look = (sel) => q(`const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const s = getComputedStyle(e), b = getComputedStyle(e, '::before'), oldSvg = e.querySelector(':scope > svg'); return { bg: s.backgroundImage.slice(0, 15), bs: s.borderTopStyle, bc: s.borderTopColor, circle: b.width, display: b.display, oldIcon: oldSvg ? getComputedStyle(oldSvg).display : 'ไม่มี', over: e.scrollHeight > e.clientHeight + 1 };`);
const good = (m) => m && m.bg.startsWith("linear-gradient") && m.bs === "dashed" && m.circle === "58px" && m.oldIcon !== "block" && m.oldIcon !== "inline" && !m.over;

await q("location.reload();").catch(() => null);
await sleep(2500); await waitFor("return !!document.querySelector('.nav');");

await nav("ใส่โปสเตอร์");
const pm = await look("[data-drop=movie]"), pp = await look("[data-drop=poster]");
check("หน้าใส่โปสเตอร์ ช่องหนังกับช่องรูป พื้นไล่โทน เส้นประ วงกลม", good(pm) && good(pp), JSON.stringify(pm));
await c.shot(`${OUT}/01-ใส่โปสเตอร์.png`);
await q("document.querySelector('[data-drop=movie]').classList.add('over');"); await sleep(250);
const ov = await q("const s = getComputedStyle(document.querySelector('[data-drop=movie]')), s2 = getComputedStyle(document.querySelector('[data-drop=poster]')); return { solid: s.borderTopStyle, bg: s.backgroundColor, img: s.backgroundImage, other: s2.borderTopStyle };");
check("ตอนลากค้าง เส้นทึบ พื้นเข้มกว่า ไม่มีไล่โทน ช่องอื่นไม่เปลี่ยน", ov.solid === "solid" && ov.img === "none" && ov.other === "dashed", JSON.stringify(ov));
await c.shot(`${OUT}/02-ตอนลากค้าง.png`);
await q("document.querySelector('[data-drop=movie]').classList.remove('over'); document.querySelector('[data-drop=movie]').classList.add('bad');"); await sleep(250);
const bd = await q("const e = document.querySelector('[data-drop=movie]'), s = getComputedStyle(e); return { bg: s.backgroundColor, img: s.backgroundImage, color: s.color, circle: getComputedStyle(e, '::before').backgroundColor };");
check("ไฟล์ผิดชนิด ช่องแดงไม่มีไล่โทน วงแดงตาม", bd.img === "none" && /176, 69, 69/.test(bd.circle), JSON.stringify(bd));
await q("document.querySelector('[data-drop=movie]').classList.remove('bad');");

await nav("จับคู่ปก");
const lk = await look("[data-link-drop]");
check("หน้าจับคู่ปก", good(lk), JSON.stringify(lk));
await c.shot(`${OUT}/03-จับคู่ปก.png`);

await nav("เสียงและซับ");
const av = await look("[data-drop=movie]");
check("หน้าเสียงและซับ ไอคอนเดิมถูกแทน", good(av) && av.oldIcon === "none", JSON.stringify(av));
await c.shot(`${OUT}/04-เสียงซับ.png`);

await nav("กราฟเสียง");
await q("document.querySelector('[data-graphhome]')?.click();");
await waitFor("return !!document.querySelector('[data-graphdrop]');");
const gr = await look("[data-graphdrop]");
const inked = await q("const b = document.querySelector('[data-graphdrop] b'); return { color: getComputedStyle(b).color, ink: getComputedStyle(document.querySelector('[data-graphdrop]')).color };");
check("หน้ารวมกราฟเสียง ไอคอนเดิมถูกแทน", good(gr) && gr.oldIcon === "none", JSON.stringify(gr));
check("หัวข้อในช่องใช้สีเน้น", inked.color === inked.ink, JSON.stringify(inked));
await c.shot(`${OUT}/05-หน้ารวมกราฟ.png`);

await q("[...document.querySelectorAll('.gmodebar button')].find((b) => b.textContent.includes('แปลงเสียง')).click();");
await waitFor("return !!document.querySelector('[data-qdrop]');");
const cv = await look("[data-qdrop]");
check("หน้าแปลงเสียงคิวว่าง มีวงกลม", good(cv), JSON.stringify(cv));
await c.shot(`${OUT}/06-แปลงเสียง.png`);
// แถวลากเพิ่มตอนคิวมีไฟล์ ใช้ตัวเลือกเดียวกับโปรแกรม แถวเตี้ยไม่มีวง
await q("document.querySelector('[data-qdrop]').style.minHeight = '0px';"); await sleep(250);
const low = await look("[data-qdrop]");
check("แถวลากเพิ่มใต้คิว ไม่มีวงใหญ่", low.display === "none", JSON.stringify(low));
await q("document.querySelector('[data-qdrop]').style.minHeight = '120px';");
await q("[...document.querySelectorAll('.gmodebar button')].find((b) => b.textContent.includes('ดูกราฟ'))?.click();"); await sleep(300);

/* ---------- โทนอื่น ---------- */
const before = await q("return localStorage.getItem('ms.tone') ?? 'quartz';");
await nav("ใส่โปสเตอร์");
for (const t of ["wine", "night", "sage", "mauve"]) {
  await q(`window.__applyTone(${JSON.stringify(t)});`); await sleep(600);
  const m = await q("const e = document.querySelector('[data-drop=movie]'), s = getComputedStyle(e), r = getComputedStyle(document.documentElement); return { img: s.backgroundImage.slice(0, 15), circle: getComputedStyle(e, '::before').backgroundColor, accent: r.getPropertyValue('--accent') };");
  const hex = m.accent.trim().match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16)).join(", ");
  check(`โทน ${t} วงตามสีเน้นของโทน`, m.circle.includes(hex) && m.img.startsWith("linear-gradient"), JSON.stringify(m));
  await c.shot(`${OUT}/07-โทน-${t}.png`);
}
await q(`window.__applyTone(${JSON.stringify(before)});`);
await nav("ชั้นวางหนัง");

const pass = results.filter((r) => r.ok).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 1));
c.close();
process.exitCode = pass === results.length ? 0 : 1;
