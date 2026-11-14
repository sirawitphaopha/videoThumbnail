// หน้าแก้ซับ ขั้น 4 ภาพหนังทีละเฟรมกับ keyframe (แผนหน้าแก้ซับ · BUGS ข้อ 109) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-subvideo.mjs
// ภาพตรงเฟรมที่ขอ (อ่านค่าสีกล่องกลางภาพจริง หนังทดสอบกล่องกลางสว่างเท่า เลขเฟรม × 8 หาร 256 เหลือเศษ)
// เดินทีละเฟรม ลูกศร Shift Ctrl Alt · Ctrl+1 Ctrl+2 Ctrl+G · AUTO · โหมดเฟรมในช่องแก้บรรทัดกับตาราง · ขนาดภาพกับ Ctrl หมุนล้อ
// หาจุดเปลี่ยนฉาก บันทึกและเปิดไฟล์ keyframe · รายละเอียดวิดีโอ · วิดีโอจำลอง จำไว้ในไฟล์ ASS แล้วเปิดคืน · ปิดวิดีโอแล้วเปิดคืน
// ไฟล์ที่เขียนอยู่ใน D:\dev\tmp\ชั้นแก้ซับวิดีโอ เท่านั้น ลบทิ้งตอนจบ · ไม่เปิดกล่องเลือกไฟล์ของ Windows (ใช้ทางลัดของรุ่นทดสอบ)
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const MOVIE = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv";
const TMP = "D:/dev/tmp/ชั้นแก้ซับวิดีโอ";
const SHOT = "docs/report-2026-11-13/แก้ซับ-ขั้น4";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(SHOT, { recursive: true });
// ซับอย่างเดียวต้องอยู่ในโฟลเดอร์ที่ไม่มีหนังชื่อเดียวกัน ไม่งั้นหน้าซับไตเติลจับคู่หนังให้เอง
const SRT = `${TMP}/ซับอย่างเดียว.th.srt`;
copyFileSync("D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).th.srt", SRT);

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click();`);
const S = "window.__subEdit";
/** กดปุ่มพร้อมปุ่มกำกับ · Alt 1 Ctrl 2 Shift 8 */
const KEYS = { ArrowLeft: 37, ArrowRight: 39, Digit1: 49, Digit2: 50, KeyG: 71, Numpad4: 100, Numpad6: 102, Enter: 13 };
const press = async (code, mods = 0, key = code) => {
  const vk = KEYS[code] ?? 0;
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, modifiers: mods, windowsVirtualKeyCode: vk });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers: mods, windowsVirtualKeyCode: vk });
};
const pos = () => q(`return document.querySelector('[data-vpos]')?.innerText ?? '';`);
const frameNo = async () => { const t = await pos(); const m = / - (\d+)$/.exec(t); return m ? +m[1] : null; };
/** รอภาพของเฟรม n ขึ้นจอ แล้วอ่านค่าความสว่างกลางกล่อง คืนเลขเฟรมในช่วง 0 ถึง 31 ที่ค่าสีตรงที่สุด */
const imgFrame = async (n) => {
  await waitFor(`const i = document.querySelector('[data-vframe] img'); return !!i && i.alt === ${JSON.stringify(`ภาพหนังเฟรม ${n}`)} && i.complete;`, 8000);
  await sleep(150);
  return q(`const i = document.querySelector('[data-vframe] img'); if (!i) return null;
    const cv = document.createElement('canvas'); cv.width = i.naturalWidth; cv.height = i.naturalHeight;
    const g = cv.getContext('2d'); g.drawImage(i, 0, 0);
    const p = g.getImageData(Math.round(cv.width / 2), Math.round(cv.height / 2), 1, 1).data;
    const y = 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2];
    const yTv = y * 219 / 255 + 16;
    let best = 0, bd = 1e9; for (let k = 0; k < 32; k++) { const d = Math.abs(((k * 8) % 256) - yTv); if (d < bd) { bd = d; best = k; } }
    return best;`);
};
/** ฉากของภาพจากสีพื้นมุมล่างซ้าย (หนังทดสอบพื้นสว่าง 40 + 36 × ฉาก) · ใช้กับเฟรมที่กล่องกลางมืดหรือสว่างจนค่าสีถูกตัด เช่นเฟรม 96 */
const imgScene = () => q(`const i = document.querySelector('[data-vframe] img'); if (!i) return null;
  const cv = document.createElement('canvas'); cv.width = i.naturalWidth; cv.height = i.naturalHeight;
  const g = cv.getContext('2d'); g.drawImage(i, 0, 0);
  const p = g.getImageData(Math.round(cv.width * 0.06), Math.round(cv.height * 0.85), 1, 1).data;
  const yTv = (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) * 219 / 255 + 16;
  return Math.round((yTv - 41) / 36);`);

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  try { localStorage; } catch { /* ไม่มีในฝั่ง node */ }
  await q("try { localStorage.removeItem('se-vzoom'); localStorage.setItem('se-vauto', '1'); localStorage.removeItem('se-vhidekeys'); localStorage.removeItem('se-dummy'); } catch {} return 1;");
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  await nav("ซับไตเติล"); await sleep(300);
  await q("window.__subClear(); window.__subOpen(" + JSON.stringify(MOVIE) + "); return 1;");
  check("เปิดหนังทดสอบแล้วหน้าแก้ซับขึ้น", await waitFor("return !!document.querySelector('[data-se-text]')", 20000));
  check("อ่านเวลาของทุกเฟรมเสร็จ ช่องเวลาขึ้นเลขเฟรม", await waitFor("return / - \\d+$/.test(document.querySelector('[data-vpos]')?.innerText ?? '')", 20000), await pos());

  // ---------- เลือกบรรทัด AUTO พาภาพไปเฟรมแรกที่ซับขึ้น ----------
  const first = await q(`const s = ${S}.get(); const e = s.doc.events.find((x) => x.id === s.active); return { start: e.start, end: e.end, i: s.doc.events.indexOf(e) };`);
  const f0 = await frameNo();
  check("AUTO เปิดอยู่ ภาพอยู่เฟรมแรกที่บรรทัดแรกขึ้น 0.50 วินาที คือเฟรม 12", f0 === 12 && first.start === 500, `${await pos()}`);
  check("ภาพที่ขึ้นเป็นเฟรม 12 จริง (ค่าสีกลางภาพ)", (await imgFrame(12)) === 12);
  const off = await q("return document.querySelector('[data-voff]')?.innerText;");
  check("มุมขวาบนบอกห่างจากเวลาเริ่ม +0ms และจากเวลาจบ -2900ms", off === "+0ms; -2900ms", off);
  await c.shot(`${SHOT}/1-กรอบวิดีโอ-1280.png`, "[data-subedit] .se-top", 6);

  // ---------- เดินทีละเฟรม ----------
  await q("document.querySelector('[data-vnext]').click(); return 1;");
  check("ปุ่มเดินหนึ่งเฟรมไปเฟรม 13 ภาพตรงเฟรม", (await frameNo()) === 13 && (await imgFrame(13)) === 13, await pos());
  await q("document.querySelector('[data-sub-table]').focus(); return 1;");
  await press("ArrowRight"); await sleep(80);
  check("ลูกศรขวาในตารางเดินภาพหนึ่งเฟรม", (await frameNo()) === 14, await pos());
  await press("ArrowRight", 8); await sleep(80);
  const k96 = await q("return document.querySelector('[data-vpos]').dataset.vkey ?? null;");
  check("Shift ลูกศรขวาไป keyframe ถัดไป เฟรม 96 ช่องเวลาเปลี่ยนสี", (await frameNo()) === 96 && k96 === "1", await pos());
  const k96box = await imgFrame(96);
  check("ภาพตรง keyframe เป็นฉากที่สองแล้ว (เฟรม 95 ยังเป็นฉากแรก) กล่องกลางมืดแบบเฟรม 96", (await imgScene()) === 1 && k96box <= 2, `ฉาก ${await imgScene()} กล่อง ${k96box}`);
  await c.shot(`${SHOT}/2-ตรง-keyframe.png`, "[data-subedit] .se-video", 6);
  await press("ArrowLeft", 1); await sleep(80);
  check("Alt ลูกศรซ้ายถอย 10 เฟรม", (await frameNo()) === 86, await pos());
  await press("ArrowLeft"); await sleep(80);
  check("ลูกศรซ้ายถอยหนึ่งเฟรม ภาพตรงเฟรม 85", (await frameNo()) === 85 && (await imgFrame(85)) === 85 % 32, await pos());
  await press("ArrowLeft", 8); await sleep(80);
  check("Shift ลูกศรซ้ายกลับ keyframe ก่อนหน้า เฟรม 0", (await frameNo()) === 0, await pos());
  // Ctrl ลูกศร ไปเวลาเริ่ม เวลาจบ แล้วบรรทัดถัดไป
  await press("ArrowRight", 2); await sleep(80);
  const b1 = await frameNo();
  await press("ArrowRight", 2); await sleep(80);
  const b2 = await frameNo();
  check("Ctrl ลูกศรขวาไปเวลาเริ่มแล้วเวลาจบของบรรทัด เฟรม 12 แล้ว 81", b1 === 12 && b2 === 81, `${b1} ${b2}`);
  await press("ArrowRight", 2); await sleep(150);
  const nx = await q(`const s = ${S}.get(); return s.doc.events.findIndex((x) => x.id === s.active);`);
  check("Ctrl ลูกศรขวาอีกครั้งเลือกบรรทัดถัดไปแล้วภาพไปเวลาเริ่มของบรรทัดนั้น 4.10 วินาที", nx === first.i + 1 && (await frameNo()) === 99, `${nx} ${await pos()}`);
  await press("ArrowLeft", 2); await sleep(150);
  const pv = await q(`const s = ${S}.get(); return s.doc.events.findIndex((x) => x.id === s.active);`);
  check("Ctrl ลูกศรซ้ายกลับบรรทัดก่อน ภาพไปเฟรมสุดท้ายของบรรทัดนั้น ไม่ถูก AUTO พาไปเวลาเริ่ม", pv === first.i && (await frameNo()) === 81, `${pv} ${await pos()}`);

  // ---------- Ctrl+1 Ctrl+2 Ctrl+G ----------
  await q("document.querySelector('[data-se-text]').focus(); return 1;");
  await press("Digit1", 2, "1"); await sleep(100);
  check("Ctrl+1 ไปเวลาเริ่มของบรรทัด ใช้ได้ตอนพิมพ์ในช่อง", (await frameNo()) === 12, await pos());
  await press("Digit2", 2, "2"); await sleep(100);
  check("Ctrl+2 ไปเฟรมสุดท้ายที่ซับยังอยู่", (await frameNo()) === 81, await pos());
  await press("Numpad6", 2, "6"); await sleep(100);
  check("Ctrl+6 บนแป้นตัวเลขเดินหนึ่งเฟรม", (await frameNo()) === 82, await pos());
  await press("KeyG", 2, "g");
  check("Ctrl+G เปิดหน้าต่างข้ามไปยัง", await waitFor("return !!document.querySelector('[data-vjump-frame]')"));
  await q(`const i = document.querySelector('[data-vjump-frame]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '250'); i.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
  const jt = await q("return document.querySelector('[data-vjump-time]').value;");
  check("พิมพ์เฟรม 250 ช่องเวลาเปลี่ยนตาม", jt === "0:00:10.417", jt);
  await sleep(300);
  await c.shot(`${SHOT}/3-ข้ามไปยัง.png`, ".dlg", 10);
  await q("document.querySelector('[data-vjump-go]').click(); return 1;"); await sleep(150);
  check("กดข้ามไป ภาพไปเฟรม 250 ภาพตรงเฟรม", (await frameNo()) === 250 && (await imgFrame(250)) === 250 % 32, await pos());

  // ---------- AUTO ปิด ----------
  await q("document.querySelector('[data-vauto]').click(); return 1;");
  await q(`const s = ${S}.get(); const e = s.doc.events[${first.i + 2}]; ${S}.select([e.id], e.id); return 1;`); await sleep(150);
  check("ปิด AUTO แล้วเลือกบรรทัดอื่น ภาพอยู่ที่เดิม", (await frameNo()) === 250, await pos());
  await q("document.querySelector('[data-vauto]').click(); return 1;");
  await q(`const s = ${S}.get(); const e = s.doc.events[${first.i}]; ${S}.select([e.id], e.id); return 1;`); await sleep(150);
  check("เปิด AUTO กลับ เลือกบรรทัดแรกภาพไปเฟรม 12", (await frameNo()) === 12, await pos());

  // ---------- โหมดเฟรมในช่องแก้บรรทัดกับตาราง ----------
  await q("[...document.querySelectorAll('[data-se-edit] .seg button')].find((b) => b.innerText === 'เฟรม').click(); return 1;"); await sleep(150);
  const fm = await q("return ['start','end','dur'].map((k) => document.querySelector(`[data-se-time=${k}]`).value);");
  check("โหมดเฟรม ช่องเริ่ม 12 จบ 81 ยาว 70 เฟรม", fm.join(",") === "12,81,70", fm.join(","));
  const gridF = await q(`const s = ${S}.get(); const r = document.querySelector('[data-sub-table] tr[data-id="' + s.active + '"]'); return [...r.children].slice(2, 5).map((x) => x.innerText);`);
  check("ตารางแสดงเลขเฟรมด้วย", gridF.join(",") === "12,81,70", gridF.join(","));
  await q(`const i = document.querySelector('[data-se-time=end]'); i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, '95'); i.dispatchEvent(new Event('input', { bubbles: true })); i.blur(); return 1;`); await sleep(150);
  const e95 = await q(`const s = ${S}.get(); const e = s.doc.events.find((x) => x.id === s.active); return { end: e.end, show: document.querySelector('[data-se-time=end]').value };`);
  check("พิมพ์เฟรมจบ 95 เวลาจบเป็นกึ่งกลางระหว่างเฟรม 95 กับ 96 แบบ Aegisub (3.98 วินาที) ช่องยังเป็น 95", e95.end === 3980 && e95.show === "95", JSON.stringify(e95));
  await q(`${S}.undo(); return 1;`);
  await q("[...document.querySelectorAll('[data-se-edit] .seg button')].find((b) => b.innerText === 'เวลา').click(); return 1;");

  // ---------- ขนาดภาพ ----------
  const sz = async () => q("const b = document.querySelector('[data-vframe]').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)];");
  check("พอดีกรอบ 288 × 162", (await sz()).join("x") === "288x162", (await sz()).join("x"));
  await q(`const v = document.querySelector('[data-vframe]'); const r = v.getBoundingClientRect(); v.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 })); return 1;`); await sleep(150);
  check("หมุนล้อขึ้นบนภาพ (แบบ Aegisub ไม่ต้องกด Ctrl) ซูมจากพอดีกรอบ 45% (ขั้นใกล้สุด 50%) เป็น 62.5% ภาพ 400 × 225", (await sz()).join("x") === "400x225", (await sz()).join("x"));
  const openMenu = async () => { if (!(await q("return !!document.querySelector('[data-vmenupanel]');"))) await q("document.querySelector('[data-vmenu]').click(); return 1;"); return waitFor("return !!document.querySelector('[data-vmenupanel]')"); };
  const pickZoom = async (label) => {
    await openMenu();
    await q("document.querySelector('[data-vmenupanel] button.dd').click(); return 1;"); await sleep(200);
    await q(`[...document.querySelectorAll('[data-vmenupanel] [role=option]')].find((b) => b.innerText.trim() === ${JSON.stringify(label)})?.click(); return 1;`); await sleep(200);
  };
  await pickZoom("100%");
  if (await q("return !!document.querySelector('[data-vmenupanel]');")) await q("document.querySelector('[data-vmenu]').click(); return 1;");
  await sleep(200);
  const z100 = await q("const i = document.querySelector('[data-vframe] img'); const v = document.querySelector('[data-vframe]'); const w = document.querySelector('[data-subedit] .se-wavebox')?.getBoundingClientRect(); return { img: i.style.width + 'x' + i.style.height, box: Math.round(v.getBoundingClientRect().width), scroll: v.scrollWidth > v.clientWidth, wave: w ? Math.round(w.width) : 0, page: document.documentElement.scrollWidth };");
  check("ขนาดภาพ 100% ภาพจริง 640 × 360 กรอบเลื่อนดูส่วนเกินได้ คลื่นเสียงยังกว้างอย่างน้อย 360 จุด ไม่ล้นหน้าต่าง", z100.img === "640pxx360px" && z100.wave >= 360 && z100.page <= 1280, JSON.stringify(z100));
  await c.shot(`${SHOT}/4-ขนาดภาพ-100.png`, "[data-subedit] .se-top", 6);
  await pickZoom("พอดีกรอบ");
  check("กลับเป็นพอดีกรอบ", (await sz()).join("x") === "288x162", (await sz()).join("x"));

  // ---------- เมนูวิดีโอ keyframe ----------
  await openMenu();
  const ks0 = await q("return document.querySelector('[data-vkeysrc]').innerText;");
  check("เมนูบอก keyframe ของหนัง 6 จุด", ks0 === "keyframe ของหนัง 6 จุด", ks0);
  const fitMenu = await q("const e = document.querySelector('[data-vmenupanel]'); const p = e.getBoundingClientRect(); const b = document.querySelector('[data-vmenu]').getBoundingClientRect(); return { top: Math.round(p.top), bottom: Math.round(p.bottom), h: innerHeight, right: Math.round(p.right), w: innerWidth, down: p.top >= b.bottom, all: e.scrollHeight <= e.clientHeight + 1 };");
  check("เมนูวิดีโอกางลงใต้ปุ่ม เห็นครบทุกแถวไม่ต้องเลื่อน ไม่ล้นจอ", fitMenu.down && fitMenu.all && fitMenu.bottom <= fitMenu.h && fitMenu.right <= fitMenu.w, JSON.stringify(fitMenu));
  await sleep(300);
  await c.shot(`${SHOT}/5-เมนูวิดีโอ.png`, "[data-vmenupanel]", 8);
  await q("document.querySelector('[data-vmi=scenes]').click(); return 1;");
  check("กดหาจุดเปลี่ยนฉาก ได้ 4 จุด แทนเส้น keyframe", await waitFor("return document.querySelector('[data-vkeysrc]')?.innerText === 'จุดเปลี่ยนฉากที่หาเอง 4 จุด'", 30000), await q("return document.querySelector('[data-vkeysrc]')?.innerText"));
  // บันทึกเป็นไฟล์ keyframe แล้วเปิดคืน
  const KF = `${TMP}/ฉากตัด_keyframes.txt`;
  await q(`window.__vidKeysSave = ${JSON.stringify(KF)}; document.querySelector('[data-vmi=keyssave]').click(); return 1;`);
  await waitFor("return /บันทึกแล้ว/.test(document.querySelector('[data-vmsg]')?.innerText ?? '')");
  const kft = existsSync(KF) ? readFileSync(KF, "utf8") : "";
  check("บันทึกไฟล์ keyframe แบบ Aegisub v1 ได้ 96 192 288 384", kft === "# keyframe format v1\nfps 0\n96\n192\n288\n384\n", JSON.stringify(kft));
  // ไฟล์ของ x264 (บอกชนิดเฟรมทีละบรรทัด) เปิดได้
  const X264 = `${TMP}/x264.stats`;
  writeFileSync(X264, "#options: 640x360 fps=24/1\n" + Array.from({ length: 30 }, (_, i) => `in:${i} out:${i} type:${i === 0 || i === 24 ? "I" : "P"} dur:2\n`).join(""));
  await q(`window.__vidKeysOpen = ${JSON.stringify(X264)}; document.querySelector('[data-vmi=keysopen]').click(); return 1;`);
  check("เปิดไฟล์สถิติของ x264 ได้ keyframe 2 จุด", await waitFor("return /^จากไฟล์ x264.stats 2 จุด$/.test(document.querySelector('[data-vkeysrc]')?.innerText ?? '')"), await q("return document.querySelector('[data-vkeysrc]')?.innerText"));
  await q("document.querySelector('[data-vmi=keysmovie]').click(); return 1;"); await sleep(100);
  check("กลับไปใช้ keyframe ของหนัง", (await q("return document.querySelector('[data-vkeysrc]')?.innerText")) === "keyframe ของหนัง 6 จุด");
  // ซ่อนเส้น
  await q("document.querySelector('[data-vmenupanel] .se-vmsw button').click(); return 1;"); await sleep(100);
  const hid = await q("try { return localStorage.getItem('se-vhidekeys'); } catch { return null; }");
  await q("document.querySelector('[data-vmenupanel] .se-vmsw button').click(); return 1;");
  check("สวิตช์ซ่อนเส้น keyframe จำค่าได้", hid === "1");

  // ---------- รายละเอียดวิดีโอ ----------
  await q("document.querySelector('[data-vmi=details]').click(); return 1;");
  check("รายละเอียดวิดีโอเปิด", await waitFor("return !!document.querySelector('[data-vdetails]')"));
  const det = await q("return document.querySelector('[data-vdetails]').innerText;");
  check("รายละเอียดบอกขนาดภาพ จำนวนเฟรม keyframe และ codec", /640 × 360/.test(det) && /480 เฟรม/.test(det) && /6 จุด/.test(det) && /h264/.test(det), det.replace(/\n/g, " | "));
  await sleep(300);
  await c.shot(`${SHOT}/6-รายละเอียดวิดีโอ.png`, ".dlg", 10);
  await q("[...document.querySelectorAll('.dlg .btn')].find((b) => b.innerText === 'ปิด').click(); return 1;"); await sleep(200);

  // ---------- วิดีโอจำลอง ----------
  await q("document.querySelector('[data-vmenu]').click(); return 1;");
  await waitFor("return !!document.querySelector('[data-vmenupanel]')");
  await q("document.querySelector('[data-vmi=dummy]').click(); return 1;");
  check("หน้าต่างวิดีโอจำลองเปิด ค่าตั้งต้นแบบ Aegisub 1280 × 720 24000/1001 40000 เฟรม", await waitFor("return !!document.querySelector('[data-vdummy]')") && (await q("return [document.querySelector('[data-vdummy-w]').value, document.querySelector('[data-vdummy-h]').value, document.querySelector('[data-vdummy-fps]').value, document.querySelector('[data-vdummy-len]').value].join(' ');")) === "1280 720 24000/1001 40000");
  const setIn = (sel, v) => q(`const i = document.querySelector(${JSON.stringify(sel)}); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
  await setIn("[data-vdummy-fps]", "abc");
  const bad = await q("const b = document.querySelector('[data-vdummy-use]'); return [b.getAttribute('aria-disabled'), b.title];");
  check("อัตราเฟรมอ่านไม่ออก ปุ่มใช้กดไม่ได้พร้อมเหตุผล", bad[0] === "true" && /อัตราเฟรม/.test(bad[1]), bad.join(" "));
  await setIn("[data-vdummy-fps]", "23.976"); await setIn("[data-vdummy-w]", "640"); await setIn("[data-vdummy-h]", "360"); await setIn("[data-vdummy-len]", "1000");
  await q("const sw = document.querySelector('[data-vdummy] .se-dsw button'); sw.click(); return 1;");
  const dur = await q("return document.querySelector('[data-vdummy-dur]').innerText;");
  check("ความยาว 1,000 เฟรมที่ 23.976 fps คือ 41.71 วินาที", dur === "ยาว 0:00:41.71", dur);
  await sleep(300);
  await c.shot(`${SHOT}/7-วิดีโอจำลอง.png`, ".dlg", 10);
  await q("document.querySelector('[data-vdummy-use]').click(); return 1;"); await sleep(250);
  const dm = await q(`const s = ${S}.get(); const g = s.doc.skeleton.filter((x) => x.k === 'line').map((x) => x.t); return { canvas: !!document.querySelector('[data-vdummy-canvas]'), video: g.find((t) => t.startsWith('Video File')) ?? null, head: g.includes('[Aegisub Project Garbage]'), dirty: s.dirty, pos: document.querySelector('[data-vpos]').innerText };`);
  check("ใช้วิดีโอจำลอง ภาพเป็นตารางหมากรุก ไฟล์ ASS จำไว้แบบ Aegisub", dm.canvas && dm.head && dm.video === "Video File: ?dummy:23.976:1000:640:360:47:163:254:c" && dm.dirty, JSON.stringify(dm));
  await q("document.querySelector('[data-vnext]').click(); return 1;"); await sleep(100);
  check("วิดีโอจำลองเดินทีละเฟรมได้ เวลาตามอัตรา 23.976", /^0:00:00\.\d{3} - \d+$/.test(await pos()), await pos());
  await c.shot(`${SHOT}/8-วิดีโอจำลอง-ภาพ.png`, "[data-subedit] .se-video", 6);
  // บันทึกเป็นไฟล์ ASS ใหม่ แล้วเปิดไฟล์นั้นอย่างเดียว ต้องได้วิดีโอจำลองเดิม
  const SAVED = `${TMP}/ฉากตัด จำลอง.ass`;
  const sv = await q(`return await window.__subEditSaveNew('ass', ${JSON.stringify(SAVED)});`);
  void sv;
  await waitFor(`return ${JSON.stringify(SAVED)} && !${S}.get().dirty`, 8000);
  check("บันทึกเป็นไฟล์ ASS ใหม่ มีบรรทัด Video File ในไฟล์", existsSync(SAVED) && readFileSync(SAVED, "utf8").includes("Video File: ?dummy:23.976:1000:640:360:47:163:254:c"));
  // ปิดวิดีโอจำลอง ค่าที่จำในไฟล์ถูกลบ แล้วภาพบอกว่าปิดวิดีโออยู่
  await q("document.querySelector('[data-vmenu]').click(); return 1;");
  await waitFor("return !!document.querySelector('[data-vmenupanel]')");
  await q("document.querySelector('[data-vmi=close]').click(); return 1;"); await sleep(200);
  const cl = await q(`const s = ${S}.get(); return { video: s.doc.skeleton.some((x) => x.k === 'line' && x.t.startsWith('Video File')), reopen: !!document.querySelector('[data-vreopen]'), txt: document.querySelector('[data-vframe]').innerText };`);
  check("ปิดวิดีโอจำลอง ลบค่าที่จำในไฟล์ กรอบบอกว่าปิดวิดีโออยู่พร้อมปุ่มเปิดวิดีโอของหนัง", !cl.video && cl.reopen && /ปิดวิดีโออยู่/.test(cl.txt), JSON.stringify(cl));
  await q("document.querySelector('[data-vreopen]').click(); return 1;");
  check("เปิดวิดีโอของหนังคืน ภาพกลับมา", await waitFor("return !!document.querySelector('[data-vframe] img') && / - \\d+$/.test(document.querySelector('[data-vpos]')?.innerText ?? '')"));
  await q(`${S}.closeDoc(); window.__subClear(); return 1;`); await sleep(300);
  await q("window.__subOpen(" + JSON.stringify(SAVED) + "); return 1;");
  check("เปิดไฟล์ ASS ที่จำวิดีโอจำลองไว้ (ไม่มีหนัง) ได้วิดีโอจำลองเดิมเอง", await waitFor("return !!document.querySelector('[data-vdummy-canvas]')", 15000));
  const dpos = await pos();
  check("วิดีโอจำลองที่เปิดคืนขึ้นเลขเฟรมของบรรทัดแรก", / - \d+$/.test(dpos), dpos);

  // ---------- ไฟล์ซับอย่างเดียวที่ไม่ได้จำวิดีโอ ----------
  await q(`${S}.closeDoc(); window.__subClear(); return 1;`); await sleep(300);
  await q("window.__subOpen(" + JSON.stringify(SRT) + "); return 1;");
  await waitFor("return !!document.querySelector('[data-se-text]')", 15000);
  const none = await q("return { add: !!document.querySelector('[data-sub-addvideo]'), dummy: !!document.querySelector('[data-vdummy-open]'), step: document.querySelector('[data-vnext]').getAttribute('aria-disabled'), why: document.querySelector('[data-vnext]').title, seg: [...document.querySelectorAll('[data-se-edit] .seg button')].find((b) => b.innerText === 'เฟรม').title };");
  check("ซับอย่างเดียว กรอบมีปุ่มเพิ่มไฟล์วิดีโอกับวิดีโอจำลอง ปุ่มเดินเฟรมกดไม่ได้พร้อมเหตุผล", none.add && none.dummy && none.step === "true" && none.why === "ยังไม่มีวิดีโอ" && /ยังไม่มีไฟล์วิดีโอ/.test(none.seg), JSON.stringify(none));
  await c.shot(`${SHOT}/9-ไม่มีวิดีโอ.png`, "[data-subedit] .se-top", 6);
  // ไม่มีกรอบเลื่อนแนวนอน
  check("หน้าไม่มีแถบเลื่อนแนวนอนที่ 1280 × 800", (await q("return document.documentElement.scrollWidth;")) <= 1280);
} finally {
  await q(`try { ${S}.closeDoc(); window.__subClear(); delete window.__vidKeysSave; delete window.__vidKeysOpen; localStorage.removeItem('se-vzoom'); localStorage.removeItem('se-vhidekeys'); localStorage.removeItem('se-dummy'); } catch {} return 1;`).catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => {});
  rmSync(TMP, { recursive: true, force: true });
}
const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass} จาก ${results.length} ข้อ`);
process.exit(pass === results.length ? 0 : 1);
