// เทสขั้น 1 ในหน้าต่างโปรแกรมจริง ผ่านพอร์ตดีบัก (แผนขั้น 1 ตารางตรวจผล)
// ① วัดสี ขนาด ความโค้ง ของชิ้นส่วนกลางเทียบค่าในต้นแบบ docs/mockups/poster-shelf.html
// ② ชี้ทุกปุ่มด้วยเมาส์จำลอง อ่านสีที่เบราว์เซอร์คำนวณก่อนและหลัง (สกิล button-feedback ห้ามเทียบภาพ)
// ③ รายการกางใกล้ขอบล่างพลิกขึ้น · ใกล้ขอบบนกางลง · ลูกศรกับ Enter เลือกได้
// ④ หน้าต่างซ้อน กดข้างนอกไม่ปิด Esc ปิด · ปุ่มยืนยันลบอยู่ซ้าย โฟกัสแรกไม่ใช่ปุ่มลบ · Enter Space กดปุ่มได้
// ⑤ แถบแจ้งผลสำเร็จหายเองใน 3 วินาที ผิดพลาดไม่หาย
// ⑥ ย่อเมนูเหลือ 64 ขึ้นกล่องชื่อเมนู ค่าบันทึกลงไฟล์
// ⑦ กดปิดตอนมีงาน ขึ้นหน้าต่างถาม กดทำงานต่อแล้วโปรแกรมยังอยู่
// ⑧ ปิดภาพเคลื่อนไหวในเครื่องแล้วไม่มีแอนิเมชัน
// ใช้: node scripts/check-stage1.mjs  (เปิดโปรแกรมด้วย scripts/dev-app.ps1 ก่อน · เมนูต้องกางอยู่ตอนเริ่ม)
import { mkdirSync, writeFileSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-06/ขั้น1";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return `rgb(${n >> 16}, ${(n >> 8) & 255}, ${n & 255})`; };
const NEUTRAL = [100, 66]; // ชื่อโปรแกรมในเมนู ไม่ใช่ปุ่ม

const css = (sel) => c.evaluate(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const g = getComputedStyle(el), r = el.getBoundingClientRect();
  return { w: Math.round(r.width), h: Math.round(r.height), bg: g.backgroundColor, color: g.color, border: g.borderTopColor,
           radius: g.borderTopLeftRadius, font: g.fontSize, weight: g.fontWeight, family: g.fontFamily, pad: g.padding,
           anim: g.animationName, trans: g.transitionDuration };
})()`);
const settle = () => sleep(420); // การไล่สีตอนชี้ใช้ 0.15 วินาที รอเกินไว้

async function hovered(sel) {
  await c.move(...NEUTRAL); await settle();
  const before = await css(sel);
  await c.hover(sel); await settle();
  const after = await css(sel);
  await c.move(...NEUTRAL);
  return { before, after };
}

// ---------- เตรียม ----------
await c.evaluate("location.hash = '#parts'"); await sleep(400);
const side0 = await css(".side");
if (side0.w !== 200) { await c.click(".navtoggle"); await sleep(400); }
await c.shot(`${OUT}/02-ห้องชิ้นส่วน.png`);

// ---------- ① ค่าตามต้นแบบ ----------
const T = await css(".titlebar");
check("แถบชื่อสูง 34 พื้นชมพูจาง ตัวหนังสือ 13", T.h === 34 && T.bg === hex("#fbe3ec") && T.font === "13px", `${T.h}px ${T.bg} ${T.font}`);
const TB = await css(".titlebar .ctl button");
check("ปุ่มย่อ ขยาย ปิด กว้าง 46", TB.w === 46 && TB.h === 34, `${TB.w}×${TB.h}`);
const S = await css(".side");
check("เมนูซ้ายกว้าง 200 พื้น #fdeef4", S.w === 200 && S.bg === hex("#fdeef4"), `${S.w}px ${S.bg}`);
const NV = await css(".nav.on");
check("เมนูที่เลือกพื้นชมพู โค้ง 9 ขอบใน 9 10", NV.bg === hex("#fbd7e5") && NV.radius === "9px" && NV.pad === "9px 10px", `${NV.bg} ${NV.radius} ${NV.pad}`);
const BODY = await c.evaluate("getComputedStyle(document.body).fontFamily + ' ' + getComputedStyle(document.body).fontSize + ' ' + document.fonts.check('15px Sarabun')");
check("ฟอนต์ Sarabun 15 ฝังในโปรแกรม โหลดได้", BODY.includes("Sarabun") && BODY.includes("15px") && BODY.endsWith("true"), BODY);

const BTN = {
  main: ["#f6b3cb", "#7a2346", "#ef9dbb", "#f09dbd", "#6a1d3c", "#e584a9"],
  ghost: ["#ffffff", "#4a2b38", "#efc6d5", "#fdeaf1", "#c2547f", "#e79ab8"],
  ok: ["#e2f5ea", "#2f7a52", "#a9dcc0", "#cdeedb", "#24653f", "#84c9a3"],
  bad: ["#ffffff", "#b04545", "#f1b7b7", "#fde5e5", "#953535", "#e48d8d"],
  danger: ["#f6c3c3", "#8a2a2a", "#ee9e9e", "#f0a9a9", "#7a2020", "#e48585"],
  wait: ["#fdf3dc", "#a8812e", "#f0d9a2", "#fbecc5", "#94680f", "#e8c77c"],
};
for (const [k, [bg, fg, bd, hbg, hfg, hbd]] of Object.entries(BTN)) {
  const { before: b, after: a } = await hovered(`[data-btn=${k}]`);
  check(`ปุ่ม ${k} สูง 38 โค้ง 9 ตัวหนังสือ 14 หนา 600 สีตรงต้นแบบ`,
    b.h === 38 && b.radius === "9px" && b.font === "14px" && b.weight === "600" && b.bg === hex(bg) && b.color === hex(fg) && b.border === hex(bd),
    `${b.h}px ${b.radius} ${b.font}/${b.weight} ${b.bg} ${b.color} ${b.border}`);
  check(`ปุ่ม ${k} ตอนชี้เปลี่ยนเป็นสีตามต้นแบบ`, a.bg === hex(hbg) && a.color === hex(hfg) && a.border === hex(hbd), `${a.bg} ${a.color} ${a.border}`);
  await c.shot(`${OUT}/03-ชี้ปุ่ม-${k}.png`, `[data-btn=${k}]`, 10).catch(() => {});
  // ภาพตอนชี้
  await c.hover(`[data-btn=${k}]`); await settle();
  await c.shot(`${OUT}/03-ชี้ปุ่ม-${k}-ตอนชี้.png`, `[data-btn=${k}]`, 10);
  await c.move(...NEUTRAL);
}
const SM = await css("[data-btn=sm]");
check("ปุ่มเล็กสูง 32 ตัวหนังสือ 13", SM.h === 32 && SM.font === "13px", `${SM.h}px ${SM.font}`);
const { before: IB, after: IA } = await hovered("[data-btn=icon]");
check("ปุ่มไอคอน 32×32 โค้ง 8 ตอนชี้พื้นชมพูจาง", IB.w === 32 && IB.h === 32 && IB.radius === "8px" && IA.bg === hex("#fbdde8") && IA.color === hex("#c2547f"), `${IB.w}×${IB.h} ${IB.radius} → ${IA.bg}`);

const SEG = await css("[data-part=seg] .seg:not(.sm) button.on");
check("ปุ่มคู่สูง 34 ตัวหนังสือ 13.5 ที่เลือกพื้นชมพู", SEG.h === 34 && SEG.font === "13.5px" && SEG.bg === hex("#f6b3cb"), `${SEG.h}px ${SEG.font} ${SEG.bg}`);
const { after: SEGH } = await hovered("[data-part=seg] .seg:not(.sm) button:not(.on)");
check("ปุ่มคู่ที่ไม่ได้เลือก ตอนชี้พื้นชมพูจาง", SEGH.bg === hex("#fdeaf1"), SEGH.bg);
const SEGS = await css("[data-part=seg] .seg.sm:not(.seg-off) button");
check("ปุ่มสามแบบเล็กสูง 30 ตัวหนังสือ 13", SEGS.h === 30 && SEGS.font === "13px", `${SEGS.h}px ${SEGS.font}`);
const OFF = await css(".seg-off button:not(.on)");
check("ปุ่มสามที่กดไม่ได้ ตัวหนังสือจาง", OFF.color === hex("#c9a9b6"), OFF.color);
const offTitle = await c.evaluate("document.querySelector('.seg-off').title");
check("ปุ่มที่กดไม่ได้บอกเหตุผล", offTitle === "ขนาดปกใช้ได้ตอนดูแบบภาพปก", offTitle);

const { before: SW, after: SWH } = await hovered("[data-part=controls] .switch.on");
check("สวิตช์เปิด 44×26 สีชมพู ตอนชี้เข้มขึ้น", SW.w === 44 && SW.h === 26 && SW.bg === hex("#e98aac") && SWH.bg === hex("#d9719a"), `${SW.w}×${SW.h} ${SW.bg} → ${SWH.bg}`);
const { before: SO, after: SOH } = await hovered("[data-part=controls] .switch.off");
check("สวิตช์ปิดสีชมพูเทา ตอนชี้เข้มขึ้น", SO.bg === hex("#ecd3dd") && SOH.bg === hex("#e3bfce"), `${SO.bg} → ${SOH.bg}`);
const before = await c.evaluate("document.querySelector('[data-part=controls] .switch.on').getAttribute('aria-checked')");
await c.click("[data-part=controls] .switch.on"); await sleep(200);
const after = await c.evaluate("document.querySelector('[data-part=controls] label .switch').getAttribute('aria-checked')");
check("กดสวิตช์แล้วสลับ", before === "true" && after === "false", `${before} → ${after}`);
await c.click("[data-part=controls] label .switch");

const STAT = await css(".stat.ok"), CARD = await css(".card") ?? { radius: "12px" };
check("การ์ดสถานะโค้ง 10", STAT.radius === "10px", STAT.radius);
const SK = await css(".skel");
check("โครงจางมีแอนิเมชันคลื่น", SK.anim === "skel-wave", SK.anim);

// ปุ่มที่ไม่มีกฎตอนชี้เลย ทั้งหน้า (สกิล button-feedback)
// ตัดกฎที่ส่วนหน้า :hover เช่น ".chk:hover .box" นับว่าเป็นกฎของ .chk (ชี้ตัวนี้แล้วชิ้นข้างในเปลี่ยน)
const noHover = await c.evaluate(`(() => {
  const rules = [];
  for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) if (r.selectorText?.includes(':hover')) rules.push(r.selectorText); } catch (e) {} }
  const heads = rules.flatMap(s => s.split(',')).filter(p => p.includes(':hover')).map(p => p.slice(0, p.indexOf(':hover')).trim()).filter(Boolean);
  return [...document.querySelectorAll('button,[role="button"],[role="switch"],[role="slider"],[role="checkbox"],[role="radio"],[role="option"]')]
    .filter(b => !heads.some(h => { try { return b.matches(h); } catch (e) { return false; } }))
    .map(b => (b.getAttribute('aria-label') || b.innerText || b.className).trim());
})()`);
check("ทุกปุ่มในหน้ามีกฎตอนชี้", noHover.length === 0, noHover.join(" · ") || "ครบ");
// ของที่เปลี่ยนสีที่ชิ้นข้างใน ชี้จริงแล้ววัดชิ้นข้างใน
for (const [name, host, part] of [
  ["ช่องติ๊ก", "[data-part=controls] [role=checkbox]", "[data-part=controls] [role=checkbox] .box"],
  ["ปุ่มเลือกที่ไม่ได้เลือก", "[data-part=controls] [role=radio][aria-checked=false]", "[data-part=controls] [role=radio][aria-checked=false] .radio"],
  ["จุดจับแถบเลื่อนค่า", "[data-part=controls] .range", "[data-part=controls] .range b"],
]) {
  await c.move(...NEUTRAL); await settle();
  const b = await css(part);
  await c.hover(host); await settle();
  const a = await css(part);
  check(`${name} ตอนชี้เปลี่ยนสี`, a.bg !== b.bg || a.border !== b.border, `${b.bg} ${b.border} → ${a.bg} ${a.border}`);
}
await c.move(...NEUTRAL);

// ปุ่มแถบชื่อกับเมนู ตอนชี้
const { after: MIN } = await hovered(".titlebar .ctl button:first-child");
check("ปุ่มย่อหน้าต่างตอนชี้พื้นชมพู", MIN.bg === hex("#f9dde8"), MIN.bg);
const { after: CLS } = await hovered(".titlebar .ctl button.close");
check("ปุ่มปิดตอนชี้พื้นแดงจาง", CLS.bg === hex("#f6c3c3") && CLS.color === hex("#8a2a2a"), `${CLS.bg} ${CLS.color}`);
await c.hover(".titlebar .ctl button.close"); await settle();
await c.shotRect(`${OUT}/04-ชี้ปุ่มปิด.png`, 1100, 0, 180, 34); await c.move(...NEUTRAL);
const { after: NVH } = await hovered(".nav:not(.on):not(.navtoggle)");
check("เมนูที่ไม่ได้เลือก ตอนชี้พื้นชมพู", NVH.bg === hex("#f9dde8") && NVH.color === hex("#c2547f"), `${NVH.bg} ${NVH.color}`);

// ---------- ③ รายการกาง ----------
await c.click("[data-part=dd-bottom] .dd"); await sleep(250);
let r = await c.evaluate(`(() => { const b = document.querySelector('[data-part=dd-bottom] .dd').getBoundingClientRect(); const m = document.querySelector('[data-part=dd-bottom] .menu').getBoundingClientRect(); return { btnTop: b.top, menuBottom: m.bottom, menuTop: m.top, inner: innerHeight }; })()`);
check("รายการใกล้ขอบล่างพลิกขึ้น ไม่จมใต้ขอบจอ", r.menuBottom <= r.btnTop && r.menuTop >= 34, `ปุ่มบน ${Math.round(r.btnTop)} · รายการ ${Math.round(r.menuTop)}–${Math.round(r.menuBottom)}`);
await c.shotRect(`${OUT}/05-รายการพลิกขึ้น.png`, 900, Math.max(34, Math.round(r.menuTop) - 10), 380, Math.round(r.inner - r.menuTop) + 10);
await c.key("Escape"); await sleep(200);
check("Esc ปิดรายการ", !(await c.evaluate("!!document.querySelector('[data-part=dd-bottom] .menu')")));
await c.click("[data-part=dd-top] .dd"); await sleep(250);
r = await c.evaluate(`(() => { const b = document.querySelector('[data-part=dd-top] .dd').getBoundingClientRect(); const m = document.querySelector('[data-part=dd-top] .menu').getBoundingClientRect(); return { btnBottom: b.bottom, menuTop: m.top }; })()`);
check("รายการที่มีที่ว่างด้านล่าง กางลง", r.menuTop >= r.btnBottom, `ปุ่มล่าง ${Math.round(r.btnBottom)} · รายการเริ่ม ${Math.round(r.menuTop)}`);
await c.key("ArrowDown"); await c.key("Enter"); await sleep(200);
const ddText = await c.evaluate("document.querySelector('[data-part=dd-top] .dd').innerText.trim().split('\\n').pop()");
check("ลูกศรลงแล้ว Enter เลือกตัวถัดไป", ddText.includes("ชื่อ ฮ–ก"), ddText);
await c.click("[data-part=dd-top] .dd"); await sleep(150);
await c.click("[data-part=dd-top] .menu [role=option]:first-child"); await sleep(150);

// ---------- ④ หน้าต่างซ้อน ----------
await c.evaluate("document.querySelector('[data-open=dialog]').focus()");
await c.key("Enter"); await sleep(250);
check("Enter กดปุ่มที่โฟกัสอยู่ได้ (เปิดหน้าต่าง)", await c.evaluate("!!document.querySelector('.dlg')"));
// กดพื้นหลังที่มุมซ้าย ไม่โดนตัวหน้าต่าง
await c.move(30, 400);
await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 30, y: 400, button: "left", clickCount: 1 });
await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 30, y: 400, button: "left", clickCount: 1 });
await sleep(200);
check("หน้าต่างที่มีงาน กดข้างนอกไม่ปิด", await c.evaluate("!!document.querySelector('.dlg')"));
await c.key("Escape"); await sleep(200);
check("Esc ปิดหน้าต่าง", !(await c.evaluate("!!document.querySelector('.dlg')")));
await c.click("[data-open=delete2]"); await sleep(300);
const DLG = await css(".dlg"), BACK = await css(".dlg-back");
check("หน้าต่างซ้อนโค้ง 14 พื้นหลังชมพูเข้มโปร่ง", DLG.radius === "14px" && BACK.bg === "rgba(110, 55, 80, 0.22)", `${DLG.radius} ${BACK.bg}`);
const order = await c.evaluate("[...document.querySelectorAll('.dlg .acts button')].map(b => b.innerText.trim() + (b.getBoundingClientRect().left < innerWidth/2 ? '@ซ้าย' : '@ขวา')).join(' ') + ' · โฟกัส ' + document.activeElement.innerText.trim()");
check("ลบขั้นที่ 2 ปุ่มยืนยันลบอยู่ซ้าย ย้อนกลับอยู่ขวา โฟกัสแรกไม่ใช่ปุ่มลบ", /^ยืนยันลบ.*ย้อนกลับ.*โฟกัส ย้อนกลับ$/.test(order), order);
await c.shot(`${OUT}/06-หน้าต่างลบขั้น2.png`);
await c.key("Escape"); await sleep(200);
await c.evaluate("document.querySelector('[data-open=dialog]').focus()");
await c.key("Space"); await sleep(250);
check("Space กดปุ่มที่โฟกัสอยู่ได้", await c.evaluate("!!document.querySelector('.dlg')"));
await c.key("Escape"); await sleep(200);

// ---------- ⑤ แถบแจ้งผล ----------
await c.click("[data-open=toast-ok]"); await c.click("[data-open=toast-bad]"); await sleep(400);
await c.shot(`${OUT}/07-แถบแจ้งผล.png`, ".toasts", 12);
const t0 = await c.evaluate("[...document.querySelectorAll('.toast')].map(t => t.className).join(' ')");
await sleep(3300);
const t1 = await c.evaluate("[...document.querySelectorAll('.toast')].map(t => t.className).join(' ')");
check("แถบสำเร็จหายเองใน 3 วินาที แถบผิดพลาดยังอยู่", t0.includes("ok") && t0.includes("bad") && !t1.includes("ok") && t1.includes("bad"), `ก่อน [${t0}] · หลัง 3.7 วินาที [${t1}]`);
await c.click(".toast.bad .x"); await sleep(200);
check("กดปิดแถบผิดพลาดได้", !(await c.evaluate("!!document.querySelector('.toast')")));

// ---------- ⑥ เมนูย่อ ----------
await c.click(".navtoggle"); await sleep(450);
const S2 = await css(".side");
await c.hover(".nav:nth-of-type(3)"); await sleep(250);
const tip = await c.evaluate("document.querySelector('.navtip')?.innerText ?? ''");
await c.shotRect(`${OUT}/08-เมนูย่อ.png`, 0, 34, 260, 300);
const saved = await c.evaluate("window.__TAURI_INTERNALS__.invoke('get_settings').then(r => r.settings.sidebarCollapsed)");
check("ย่อเมนูเหลือ 64 ชี้ไอคอนขึ้นชื่อเมนู ค่าบันทึกแล้ว", S2.w === 64 && tip.length > 0 && saved === true, `${S2.w}px · กล่องชื่อ "${tip}" · บันทึก ${saved}`);
await c.move(...NEUTRAL);

// ---------- ⑦ ถามก่อนปิด ----------
await c.evaluate("window.__TAURI_INTERNALS__.invoke('dev_fake_job', { seconds: 120 })");
await c.click(".titlebar .ctl button.close"); await sleep(500);
const ask = await c.evaluate("document.querySelector('.dlg h4')?.innerText ?? ''");
check("กดปิดตอนมีงาน ขึ้นหน้าต่างถาม", ask.startsWith("ยังมีงานที่กำลังทำอยู่"), ask);
await c.shot(`${OUT}/09-ถามก่อนปิด.png`);
await c.click(".dlg .btn-main"); await sleep(300);
const alive = await c.evaluate("document.title");
check("กดทำงานต่อ หน้าต่างถามหาย โปรแกรมยังอยู่", alive === "ชั้นหนัง" && !(await c.evaluate("!!document.querySelector('.dlg')")));
const jobs = await c.evaluate("window.__TAURI_INTERNALS__.invoke('running_jobs')");
check("งานยังรันอยู่ ไม่โดนตัด", jobs >= 1, `${jobs} งาน (งานปลอมของรอบก่อนที่ยังไม่ครบ 2 นาทีนับรวมด้วย)`);

// ---------- ⑧ ปิดภาพเคลื่อนไหว ----------
await c.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
await sleep(200);
const RM = await css(".side"), RMS = await css(".skel");
check("ปิดภาพเคลื่อนไหวในเครื่อง เมนูไม่เลื่อน โครงจางไม่กะพริบ", RM.trans === "0s" && RMS.anim === "none", `เมนู ${RM.trans} · โครงจาง ${RMS.anim}`);
await c.send("Emulation.setEmulatedMedia", { features: [] });

writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 2) + "\n");
const bad = results.filter((x) => !x.pass);
console.log(`\nผ่าน ${results.length - bad.length} จาก ${results.length}`);
c.close();
process.exitCode = bad.length ? 1 : 0;
