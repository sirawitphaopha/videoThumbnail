// หน้าแก้ซับ ขั้น 7 เครื่องมือของซับ ASS (แผนหน้าแก้ซับ · BUGS ข้อ 109) · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-subtools.mjs
// ① ตรรกะ สีของสไตล์ อ่านแล้วเขียนกลับเหมือนเดิม เปลี่ยนความละเอียด 720p เป็น 1080p ตัวเลขทุกช่องคูณถูก สัดส่วนภาพต่างกัน รูปวาด แท็กซ้อนใน \t
// ② กดจริง ตัวจัดการสไตล์ (เพิ่ม แก้ เปลี่ยนชื่อพร้อมบรรทัด คัดลอก ลบ ย้าย เรียง) เปลี่ยนความละเอียด ตัวช่วยแปล แล้วเลิกทำจนเอกสารเหมือนเดิม
// ③ หน้าต่างทุกบานไม่ล้น ภาพลง docs/report-2026-11-14/แก้ซับ-ขั้น7/ · ไม่เขียนไฟล์
import { mkdirSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const MOVIE = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv";
const SRT = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).th.srt";
const SHOT = "docs/report-2026-11-14/แก้ซับ-ขั้น7";
mkdirSync(SHOT, { recursive: true });

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click();`);
const S = "window.__subEdit", ST = "window.__subStyleLib", RS = "window.__subResampleLib";
const VK = { Enter: 13, Insert: 45, F8: 119, PageDown: 34, PageUp: 33, Escape: 27 };
const press = async (code, mods = 0) => {
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: code, code, modifiers: mods, windowsVirtualKeyCode: VK[code] ?? 0 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: code, code, modifiers: mods, windowsVirtualKeyCode: VK[code] ?? 0 });
  await sleep(180);
};
const snapDoc = () => q(`const d = ${S}.get().doc; return JSON.stringify({ s: d.styles.map((x) => x.fields), e: d.events.map((e) => [e.id, e.style, e.text, e.marginL, e.marginR, e.marginV]), k: d.skeleton });`);
const undoTop = () => q(`return ${S}.get().undo.at(-1)?.label ?? null;`);
const setVal = (selector, v) => q(`const el = document.querySelector(${JSON.stringify(selector)}); const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
const clickSel = (sel) => q(`const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return false; b.click(); return true;`);
const lastDlg = () => q("const ds = [...document.querySelectorAll('.dlg')]; return ds[ds.length - 1]?.innerText ?? '';");
const menu = async (item) => {
  await clickSel("[data-cmdmenu=tool]"); await sleep(200);
  const why = await q(`const b = document.querySelector('[data-cmdpanel=tool] [data-cmd=${item}]'); if (!b) return 'ไม่เจอ'; if (b.getAttribute('aria-disabled')) { const w = b.title; document.querySelector('[data-cmdmenu=tool]').click(); return w || 'กดไม่ได้'; } b.click(); return null;`);
  await sleep(300);
  return why;
};
const dlgFit = async (name) => {
  await sleep(450);
  // หน้าต่างบนสุดคือตัวสุดท้ายในหน้า ติดป้ายแล้วครอปที่ป้าย
  await q("const ds = [...document.querySelectorAll('.dlg')]; ds.forEach((d) => d.removeAttribute('data-shotdlg')); ds[ds.length - 1]?.setAttribute('data-shotdlg', '1'); return 1;");
  await c.shot(`${SHOT}/${name}.png`, "[data-shotdlg]", 4).catch(() => {});
  const g = await q(`const ds = [...document.querySelectorAll('.dlg')]; const d = ds[ds.length - 1]; const over = [...d.querySelectorAll('.se-drow, .se-dlbl, .se-dstyles, .se-stylebody')].filter((x) => x.scrollWidth > x.clientWidth + 1).map((x) => x.className + ' ' + x.innerText.slice(0, 20)); const r = d.getBoundingClientRect(); return { over, inWin: r.top >= 0 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, h: Math.round(r.height) };`);
  check(`หน้าต่าง ${name.replace(/^[0-9a-z]+-/, "")} ไม่มีแถวล้น อยู่ในหน้าต่างโปรแกรม`, !g.over.length && g.inWin, JSON.stringify(g));
};
let ORIG = null;
const restore = async (name, n = 1) => {
  for (let i = 0; i < n; i++) await q(`${S}.undo(); return 1;`);
  await sleep(150);
  check(`${name} เลิกทำแล้วเอกสารกลับเหมือนเดิม`, (await snapDoc()) === ORIG);
};
const styles = () => q(`const d = ${S}.get().doc; return d.styles.map((s) => s.fields);`);

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  await q(`try { localStorage.setItem('se-aud', JSON.stringify({ link: false, volume: 0 })); localStorage.setItem('se-vauto', '0'); localStorage.removeItem('se-style-sample'); } catch {} return 1;`);
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  await nav("ซับไตเติล"); await sleep(300);
  await q("window.__subClear(); window.__subOpen(" + JSON.stringify(MOVIE) + "); return 1;");
  check("เปิดหนังทดสอบแล้วมีเมนูเครื่องมือ", await waitFor("return !!document.querySelector('[data-cmdmenu=tool]')", 20000));
  await waitFor("return !!window.__vidLib.rate()", 20000);
  await sleep(600);
  ORIG = await snapDoc();
  const E0 = await q(`return ${S}.get().doc.events.map((e) => ({ id: e.id, start: e.start, style: e.style, text: e.text, comment: e.comment }));`);
  const at = (ms) => E0.findIndex((e) => e.start === ms && !e.comment);
  const A = at(500), B = at(4100), F = at(12000);
  const S0 = await styles();
  check("ซับในหนังมี 3 สไตล์ Default ป้ายในฉาก Song", JSON.stringify(S0.map((f) => f[0])) === JSON.stringify(["Default", "ป้ายในฉาก", "Song"]), JSON.stringify(S0.map((f) => f[0])));

  // ================================================================ ① ตรรกะ
  const lib = await q(`const L = ${ST}, R = ${RS}, d = ${S}.get().doc;
    const c = L.parseColor('&H8000FF00');
    const same = d.styles.every((s) => JSON.stringify(L.writeStyle(d, L.readStyle(d, s), s)) === JSON.stringify(s.fields));
    // สไตล์ที่เขียนต่างจากแบบที่โปรแกรมเขียน (สีตัวพิมพ์เล็ก 2.50 052) แก้ช่องเดียว ช่องอื่นต้องได้ข้อความเดิม
    const odd = { id: 999, fields: d.styles[0].fields.map((x, i) => (i === 3 ? '&h00ffffff' : i === 16 ? '2.50' : i === 21 ? '036' : x)), pre: [], raw: [] };
    const ov = L.readStyle(d, odd); ov.size = 60;
    const oddOut = L.writeStyle(d, ov, odd);
    const r = R.resample(d, { srcW: 1280, srcH: 720, dstW: 1920, dstH: 1080, mode: 'add', margin: [0, 0, 0, 0] });
    const ev = (ms) => r.events.find((e) => e.start === ms && !e.comment);
    const ar = R.resample(d, { srcW: 640, srcH: 480, dstW: 1280, dstH: 720, mode: 'add', margin: [0, 0, 0, 0] });
    const sx = R.resample(d, { srcW: 640, srcH: 480, dstW: 1280, dstH: 720, mode: 'stretch', margin: [0, 0, 0, 0] });
    const rm = R.resample(d, { srcW: 640, srcH: 480, dstW: 1280, dstH: 720, mode: 'remove', margin: [0, 0, 0, 0] });
    const k = { margin: [0, 0, 0, 0], rx: 1.5, ry: 1.5, rm: 1.5, ar: 1 };
    const B = String.fromCharCode(92);
    const t = (s) => R.resampleText(s.split('~').join(B), k);
    return {
      color: [c, L.fmtColor(c), L.fmtColor(L.parseColor('&H00A0FF&')), L.parseColor('16777215')],
      g: [L.fmtG(48), L.fmtG(2.5), L.fmtG(1 / 3), L.fmtG(3.75)],
      same, odd: [oddOut[2], oddOut[3], oddOut[16], oddOut[21]], res: L.playRes(d),
      styles: r.styles.map((s) => s.fields),
      info: [L.infoGet(r, 'PlayResX'), L.infoGet(r, 'PlayResY')],
      p: ev(4000).text, d: [ev(8300).text, ev(8300).marginL, ev(8300).marginR, ev(8300).marginV], a: ev(500).text,
      tags: [
        t('{~move(10,20,30,40,0,500)~clip(0,0,100,100)}x'),
        t('{~t(0,500,~fs80~bord2.5)~fscx120~fs+5~blur2}x'),
        t('{~p1}m 0 0 l 100 0 100 100{~p0}ข้อความ'),
        t('{หมายเหตุ ไม่ใช่แท็ก}{~pos( 10 , 20 )~iclip(m 0 0 l 10 10)}x'),
        t('{~an8~pbo3~xbord1~yshad2}x'),
      ].map((x) => x.split(B).join('~')),
      arPos: R.resampleText('{' + B + 'pos(320,240)}x', { margin: [106, 106, 0, 0], rx: 1280 / 852, ry: 1.5, rm: Math.sqrt(1280 / 852 * 1.5), ar: 1 }).split(B).join('~'),
      arStyle: ar.styles[0].fields, sxStyle: sx.styles[0].fields, rmStyle: rm.styles[0].fields, arInfo: [L.infoGet(ar, 'PlayResX'), L.infoGet(ar, 'PlayResY')],
      pT: ev(4000).text.split(B).join('~'), dT: ev(8300).text.split(B).join('~'),
    };`);
  check("สี &H8000FF00 อ่านได้เขียว ความโปร่ง 128 เขียนกลับเหมือนเดิม · สีแท็กไม่มี alpha กับสีเลขฐานสิบของ SSA อ่านได้", lib.color[0].g === 255 && lib.color[0].a === 128 && lib.color[1] === "&H8000FF00" && lib.color[2] === "&H0000A0FF" && lib.color[3].r === 255 && lib.color[3].b === 255, JSON.stringify(lib.color));
  check("ตัวเลขแบบ %g 48 2.5 0.333333 3.75", JSON.stringify(lib.g) === '["48","2.5","0.333333","3.75"]', JSON.stringify(lib.g));
  check("อ่านสไตล์แล้วเขียนกลับ ได้ข้อความเดิมทุกช่องทุกสไตล์", lib.same);
  check("แก้ขนาดช่องเดียว ช่องอื่นที่เขียนแปลก (สีตัวพิมพ์เล็ก 2.50 036) ได้ข้อความเดิมทุกตัวอักษร", JSON.stringify(lib.odd) === '["60","&h00ffffff","2.50","036"]', JSON.stringify(lib.odd));
  check("ขนาดภาพของซับ 1280 × 720", JSON.stringify(lib.res) === "[1280,720]", JSON.stringify(lib.res));
  const [sd, sp, ss] = lib.styles;
  check("720p เป็น 1080p สไตล์ Default ขนาด 52 เป็น 78 ขอบ 2.5 เป็น 3.75 เงา 1 เป็น 1.5 ระยะขอบ 40 40 36 เป็น 60 60 54 ช่องอื่นข้อความเดิม",
    sd[2] === "78" && sd[16] === "3.75" && sd[17] === "1.5" && sd[19] === "60" && sd[20] === "60" && sd[21] === "54" && sd[3] === "&H00FFFFFF" && sd[11] === "100" && sd[22] === "222", JSON.stringify(sd));
  check("ป้ายในฉาก ขนาด 40 เป็น 60 ระยะตัวอักษร 1.5 เป็น 2.25 ขอบ 3 เป็น 4.5 เงา 0 คงเดิม", sp[2] === "60" && sp[13] === "2.25" && sp[16] === "4.5" && sp[17] === "0" && sp[19] === "30", JSON.stringify(sp));
  check("Song ย่อขยายแนวนอน 95 คงเดิม (สัดส่วนเท่ากัน) ระยะขอบ 60 60 50 เป็น 90 90 75", ss[11] === "95" && ss[19] === "90" && ss[21] === "75", JSON.stringify(ss));
  check("PlayResX PlayResY ในไฟล์เปลี่ยนเป็น 1920 1080", JSON.stringify(lib.info) === '["1920","1080"]', JSON.stringify(lib.info));
  check("แท็ก pos(640,90) เป็น pos(960,135) ข้อความหลังแท็กเดิม", lib.pT.startsWith("{~pos(960,135)}ร้านกาแฟ"), lib.pT);
  check("fs60 เป็น fs90 ชื่อฟอนต์กับสีเดิม ระยะขอบของบรรทัด 25 30 48 เป็น 38 45 72", lib.dT.startsWith("{~fnLeelawadee UI~fs90~c&H00A0FF&}") && lib.d[1] === 38 && lib.d[2] === 45 && lib.d[3] === 72, JSON.stringify([lib.dT, ...lib.d.slice(1)]));
  check("บรรทัดที่ไม่มีแท็กข้อความเดิมทุกตัวอักษร", lib.a === E0[A].text);
  const T = lib.tags;
  check("move ตำแหน่งคูณ เวลาคงเดิม · clip สี่เหลี่ยมเป็นจำนวนเต็ม", T[0] === "{~move(15,30,45,60,0,500)~clip(0,0,150,150)}x", T[0]);
  check("แท็กซ้อนใน t คูณด้วย · fscx ไม่เปลี่ยน · fs+ กับ blur ไม่เปลี่ยน", T[1] === "{~t(0,500,~fs120~bord3.75)~fscx120~fs+5~blur2}x", T[1]);
  check("รูปวาดหลัง p1 คูณทุกพิกัด ข้อความหลัง p0 เดิม", T[2] === "{~p1}m 0 0 l 150 0 150 150{~p0}ข้อความ", T[2]);
  check("บล็อกหมายเหตุไม่แตะ · pos มีช่องว่างอ่านได้ · iclip รูปวาดคูณ", T[3] === "{หมายเหตุ ไม่ใช่แท็ก}{~pos(15,30)~iclip(m 0 0 l 15 15)}x", T[3]);
  check("an ไม่เปลี่ยน pbo จำนวนเต็ม xbord ตามแนวนอน yshad ตามแนวตั้ง", T[4] === "{~an8~pbo5~xbord1.5~yshad3}x", T[4]);
  check("4:3 เป็น 16:9 แบบเพิ่มขอบ ตำแหน่งกลางภาพ 320,240 ไปกลางภาพใหม่ 640,360", lib.arPos === "{~pos(640,360)}x", lib.arPos);
  check("แบบเพิ่มขอบ ขนาดตัวอักษรคูณตามแนวตั้ง 52 เป็น 78 ย่อขยายแนวนอนคงเดิม", lib.arStyle[2] === "78" && lib.arStyle[11] === "100" && JSON.stringify(lib.arInfo) === '["1280","720"]', JSON.stringify(lib.arStyle));
  check("แบบยืด ย่อขยายแนวนอน 100 เป็น 133.333 · แบบตัดขอบ ขนาดคูณมากกว่าแบบเพิ่มขอบ", lib.sxStyle[11] === "133.333" && parseFloat(lib.rmStyle[2]) > 78, `${lib.sxStyle[11]} ${lib.rmStyle[2]}`);

  // ================================================================ ② กดจริง
  // ---------- เมนูเครื่องมือ ----------
  await clickSel("[data-cmdmenu=tool]"); await sleep(250);
  await c.shot(`${SHOT}/1-เมนูเครื่องมือ.png`, "[data-cmdpanel=tool]", 6);
  const tp = await q(`const el = document.querySelector('[data-cmdpanel=tool]'); const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right, vw: innerWidth, vh: innerHeight, n: el.querySelectorAll('[data-cmd]').length };`);
  check("เมนูเครื่องมือ 3 คำสั่ง อยู่ในหน้าต่าง", tp.n === 3 && tp.top >= 0 && tp.bottom <= tp.vh && tp.right <= tp.vw, JSON.stringify(tp));
  await clickSel("[data-cmdmenu=tool]"); await sleep(150);
  const bar = await q(`const b = document.querySelector('.se-gridbar'); const pw = document.querySelector('.pagewrap'); return { sw: b.scrollWidth, cw: b.clientWidth, over: pw.scrollHeight - pw.clientHeight };`);
  check("แถบเหนือตารางที่มีเมนูที่สี่ ไม่ล้น หน้าไม่เลื่อน", bar.sw <= bar.cw && bar.over <= 0, JSON.stringify(bar));

  // ---------- ตัวจัดการสไตล์ ----------
  check("เมนูเครื่องมือ สไตล์ของซับ เปิดได้", (await menu("styles")) === null && await waitFor("return !!document.querySelector('[data-style-mgr]')", 3000));
  const rows = await q("return [...document.querySelectorAll('[data-style-row]')].map((b) => b.innerText.replace(/\\s+/g, ' '));");
  check("รายการสไตล์ 3 ตัว Default ใช้ 5 บรรทัด (รวมบรรทัดความคิดเห็น) ป้ายในฉาก 1 Song 1", rows.length === 3 && rows[0].includes("ใช้ 5 บรรทัด") && rows[1].includes("ใช้ 1 บรรทัด") && rows[2].includes("ใช้ 1 บรรทัด"), JSON.stringify(rows));
  await dlgFit("2-สไตล์ของซับ");
  await clickSel("[data-style-new]");
  check("เพิ่มสไตล์ใหม่ เปิดหน้าต่างแก้สไตล์ ชื่อตั้งต้นไม่ชนของเดิม", await waitFor("return !!document.querySelector('[data-style-editor]')", 3000) && (await q("return document.querySelector('[data-style-name]').value;")) === "Default - สำเนา");
  await setVal("[data-style-name]", "ทดสอบ");
  await setVal("[data-style-num=size]", "60");
  await clickSel("[data-style-tog=bold]"); await clickSel("[data-style-align='8']"); await sleep(150);
  await dlgFit("3-แก้สไตล์");
  await c.shot(`${SHOT}/3b-ตัวอย่างสไตล์.png`, "[data-style-preview]", 4).catch(() => {});
  await clickSel("[data-style-save]"); await sleep(250);
  let sts = await styles();
  const nw = sts[3] ?? [];
  check("บันทึกสไตล์ใหม่ ต่อท้ายเป็นตัวที่ 4 ชื่อ ทดสอบ ขนาด 60 ตัวหนา -1 ตำแหน่ง 8 ช่องอื่นค่าตั้งต้นของ Aegisub",
    sts.length === 4 && nw[0] === "ทดสอบ" && nw[1] === "Arial" && nw[2] === "60" && nw[3] === "&H00FFFFFF" && nw[4] === "&H000000FF" && nw[7] === "-1" && nw[18] === "8" && nw[16] === "2" && nw[19] === "10" && (await undoTop()) === "เพิ่มสไตล์ ทดสอบ", JSON.stringify(nw));
  check("รายการในตัวจัดการสไตล์มี 4 ตัว ตัวใหม่ถูกเลือก", (await q("return [document.querySelectorAll('[data-style-row]').length, document.querySelector('[data-style-row].on')?.dataset.styleRow];")).join() === "4,ทดสอบ");
  await restore("เพิ่มสไตล์");
  await sleep(150);
  await clickSel("[data-style-row=\"Default\"]"); await sleep(100);
  await clickSel("[data-style-edit]"); await waitFor("return !!document.querySelector('[data-style-editor]')", 3000);
  await setVal("[data-style-name]", "ปกติ"); await setVal("[data-style-num=outlineW]", "3");
  await clickSel("[data-style-save]"); await sleep(250);
  check("เปลี่ยนชื่อสไตล์ที่มีบรรทัดใช้ ถามว่าจะเปลี่ยนในบรรทัดด้วยไหม บอกจำนวน 5 บรรทัด", await waitFor("return !!document.querySelector('[data-style-rename-yes]')", 2000) && (await lastDlg()).includes("5 บรรทัด"));
  await dlgFit("4-ถามเปลี่ยนชื่อในบรรทัด");
  await clickSel("[data-style-rename-yes]"); await sleep(250);
  sts = await styles();
  const evs = await q(`return ${S}.get().doc.events.map((e) => e.style);`);
  check("เปลี่ยนชื่อเป็น ปกติ ขอบ 3 ช่องที่ไม่ได้แก้ข้อความเดิม (ขนาด 52 สี เงา) บรรทัดที่ใช้ Default ทั้ง 5 เปลี่ยนเป็น ปกติ ขั้นเลิกทำเดียว",
    sts[0][0] === "ปกติ" && sts[0][16] === "3" && sts[0][2] === "52" && sts[0][6] === "&H80000000" && sts[0][17] === "1" && evs.filter((x) => x === "ปกติ").length === 5 && !evs.includes("Default") && (await undoTop()) === "เปลี่ยนสไตล์ Default เป็น ปกติ", JSON.stringify(sts[0]));
  await restore("เปลี่ยนชื่อสไตล์");
  await clickSel("[data-style-row=\"Song\"]"); await sleep(100);
  await clickSel("[data-style-edit]"); await waitFor("return !!document.querySelector('[data-style-editor]')", 3000);
  await setVal("[data-style-name]", "เพลง"); await clickSel("[data-style-save]"); await sleep(200);
  await waitFor("return !!document.querySelector('[data-style-rename-no]')", 2000);
  await clickSel("[data-style-rename-no]"); await sleep(250);
  const evs2 = await q(`return ${S}.get().doc.events.map((e) => e.style);`);
  check("เลือกไม่เปลี่ยน สไตล์ชื่อใหม่ บรรทัดยังใช้ชื่อ Song", (await styles())[2][0] === "เพลง" && evs2[F] === "Song");
  await restore("เปลี่ยนชื่อไม่เปลี่ยนบรรทัด");
  await clickSel("[data-style-row=\"Song\"]"); await sleep(100);
  await clickSel("[data-style-edit]"); await waitFor("return !!document.querySelector('[data-style-editor]')", 3000);
  await setVal("[data-style-name]", "default"); await clickSel("[data-style-save]"); await sleep(200);
  check("ตั้งชื่อชนสไตล์อื่น (ไม่สนตัวพิมพ์) บอกว่ามีชื่อนี้แล้ว ไม่บันทึก", (await q("return document.querySelector('[data-style-err]').innerText;")) === "มีสไตล์ชื่อนี้อยู่แล้ว ตั้งชื่ออื่น" && (await snapDoc()) === ORIG);
  await setVal("[data-style-name]", "Song"); await clickSel("[data-style-save]"); await sleep(200);
  check("กดบันทึกโดยไม่แก้อะไร ไม่เพิ่มขั้นเลิกทำ หน้าต่างปิด", (await snapDoc()) === ORIG && !(await q("return !!document.querySelector('[data-style-editor]');")));
  await clickSel("[data-style-copy]"); await waitFor("return !!document.querySelector('[data-style-editor]')", 3000);
  check("คัดลอก Song ชื่อตั้งต้น Song - สำเนา", (await q("return document.querySelector('[data-style-name]').value;")) === "Song - สำเนา");
  await clickSel("[data-style-save]"); await sleep(250);
  sts = await styles();
  check("สำเนามีทุกช่องเหมือน Song ยกเว้นชื่อ", sts.length === 4 && sts[3][0] === "Song - สำเนา" && JSON.stringify(sts[3].slice(1)) === JSON.stringify(sts[2].slice(1)), JSON.stringify(sts[3]));
  await restore("คัดลอกสไตล์");
  await clickSel("[data-style-row=\"ป้ายในฉาก\"]"); await sleep(100);
  await clickSel("[data-style-del]"); await sleep(250);
  check("ลบสไตล์ ถามก่อน บอกว่ามี 1 บรรทัดใช้อยู่", (await lastDlg()).includes("มี 1 บรรทัดใช้อยู่"));
  await clickSel("[data-style-del-ok]"); await sleep(250);
  sts = await styles();
  check("ลบแล้วเหลือ 2 สไตล์ บรรทัดที่ใช้ยังอยู่", sts.length === 2 && !sts.some((s) => s[0] === "ป้ายในฉาก") && (await q(`return ${S}.get().doc.events.length;`)) === 7);
  await restore("ลบสไตล์");
  await clickSel("[data-style-row=\"Song\"]"); await sleep(100);
  await clickSel("[data-style-up]"); await sleep(150);
  check("ย้าย Song ขึ้น", JSON.stringify((await styles()).map((s) => s[0])) === JSON.stringify(["Default", "Song", "ป้ายในฉาก"]));
  await clickSel("[data-style-sort]"); await sleep(150);
  check("เรียงตามชื่อ ไม่สนตัวพิมพ์", JSON.stringify((await styles()).map((s) => s[0])) === JSON.stringify(["Default", "Song", "ป้ายในฉาก"].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))));
  await restore("ย้ายและเรียง", 2);
  await c.key("Escape"); await sleep(200);
  check("Esc ปิดตัวจัดการสไตล์", !(await q("return !!document.querySelector('[data-style-mgr]');")));

  // ---------- เปลี่ยนความละเอียด ----------
  check("เมนูเครื่องมือ เปลี่ยนความละเอียด เปิดได้", (await menu("resample")) === null && await waitFor("return !!document.querySelector('[data-resample]')", 3000));
  const rv = await q("return [...document.querySelectorAll('[data-resample] input.inp')].map((x) => x.value);");
  check("ขนาดเดิมจากไฟล์ 1280 × 720 ขนาดใหม่ตั้งต้นเป็นขนาดภาพของหนัง 640 × 360", rv.slice(0, 4).join() === "1280,720,640,360", JSON.stringify(rv));
  await clickSel("[data-rs-preset='1920x1080']"); await sleep(150);
  await dlgFit("5-เปลี่ยนความละเอียด");
  check("สัดส่วนเท่ากัน ตัวเลือกสัดส่วนภาพกดไม่ได้พร้อมเหตุผล", await q("return !!document.querySelector('[data-resample] .seg.seg-off');"));
  const expRs = await q(`const r = ${RS}.resample(${S}.get().doc, { srcW: 1280, srcH: 720, dstW: 1920, dstH: 1080, mode: 'add', margin: [0, 0, 0, 0] }); return JSON.stringify({ s: r.styles.map((x) => x.fields), e: r.events.map((e) => [e.id, e.style, e.text, e.marginL, e.marginR, e.marginV]), k: r.skeleton });`);
  await clickSel("[data-rs-run]"); await sleep(300);
  check("กดเปลี่ยนความละเอียด ผลตรงกับตรรกะ ข้อความผลบอกขนาดใหม่", (await snapDoc()) === expRs && (await undoTop()) === "เปลี่ยนความละเอียดเป็น 1920 × 1080" && /1920 × 1080/.test(await q("return document.querySelector('[data-se-cnote]')?.innerText ?? '';")));
  await restore("เปลี่ยนความละเอียด");
  await menu("resample"); await waitFor("return !!document.querySelector('[data-resample]')", 3000);
  await setVal("[data-rs='กว้างใหม่']", "640"); await setVal("[data-rs='สูงใหม่']", "480"); await sleep(150);
  const arOn = await q("return !document.querySelector('[data-resample] .seg.seg-off');");
  await q("const b = [...document.querySelectorAll('[data-resample] .seg button')].find((x) => x.innerText.trim() === 'กำหนดเอง'); b.click(); return 1;"); await sleep(150);
  check("สัดส่วนต่างกัน ตัวเลือกสัดส่วนกดได้ เลือกกำหนดเองแล้วมีช่องระยะขอบ", arOn && await q("return !!document.querySelector('[data-rs=\"ซ้าย\"]');"));
  await dlgFit("5b-เปลี่ยนความละเอียด-กำหนดเอง");
  await c.key("Escape"); await sleep(200);

  // ---------- ตัวช่วยแปล ----------
  await q(`const e = ${S}.get().doc.events; ${S}.select([e[${A}].id], e[${A}].id); return 1;`); await sleep(150);
  check("เมนูเครื่องมือ ตัวช่วยแปล เปิดได้", (await menu("translate")) === null && await waitFor("return !!document.querySelector('[data-translate]')", 3000));
  await sleep(300);
  const t0 = await q("return { line: document.querySelector('[data-tr-line]').innerText, cur: document.querySelector('[data-tr-orig] .se-trcur')?.innerText, focus: document.activeElement?.hasAttribute('data-tr-box') };");
  check(`เปิดที่บรรทัด ${A + 1} ท่อนที่เน้นคือข้อความทั้งบรรทัด โฟกัสอยู่ที่ช่องคำแปล`, t0.line === `บรรทัด ${A + 1} จาก 7` && t0.cur === E0[A].text && t0.focus, JSON.stringify(t0));
  await dlgFit("6-ตัวช่วยแปล");
  await c.type("Hello"); await press("Enter");
  let e1 = await q(`return ${S}.get().doc.events.map((e) => e.text);`);
  const t1 = await q("return { line: document.querySelector('[data-tr-line]').innerText, cur: document.querySelector('[data-tr-orig] .se-trcur')?.innerText, box: document.querySelector('[data-tr-box]').value };");
  check("พิมพ์คำแปลแล้ว Enter บรรทัดเป็น Hello แล้วไปบรรทัดถัดไป ท่อนแรก ฉากที่สอง ช่องคำแปลว่าง", e1[A] === "Hello" && t1.line === `บรรทัด ${B + 1} จาก 7` && t1.cur === "ฉากที่สอง" && t1.box === "" && (await undoTop()) === "ตัวช่วยแปล", JSON.stringify(t1));
  await c.type("ฉากสอง"); await press("Enter");
  const t2 = await q("return document.querySelector('[data-tr-orig] .se-trcur')?.innerText;");
  e1 = await q(`return ${S}.get().doc.events.map((e) => e.text);`);
  const bs = String.fromCharCode(92);
  check("แปลท่อนแรก แท็กตัวเอียงอยู่ที่เดิม แล้วไปท่อน ตัวเอียง", e1[B].startsWith(`ฉากสอง{${bs}i1}ตัวเอียง{${bs}i0}`) && t2 === "ตัวเอียง", `${e1[B].slice(0, 30)} · ${t2}`);
  await press("Insert");
  check("Insert แทรกข้อความเดิมของท่อนลงช่องคำแปล", (await q("return document.querySelector('[data-tr-box]').value;")) === "ตัวเอียง");
  await setVal("[data-tr-box]", "");
  await press("PageDown");
  check("PageDown ข้ามไปท่อน และ โดยไม่เปลี่ยนข้อความ", (await q("return document.querySelector('[data-tr-orig] .se-trcur')?.innerText;")) === " และ");
  await press("PageUp");
  check("PageUp กลับท่อน ตัวเอียง", (await q("return document.querySelector('[data-tr-orig] .se-trcur')?.innerText;")) === "ตัวเอียง");
  await c.type("ตัวลาย"); await press("F8");
  e1 = await q(`return ${S}.get().doc.events.map((e) => e.text);`);
  check("F8 ใส่คำแปลแต่อยู่ท่อนเดิม", e1[B].includes(`{${bs}i1}ตัวลาย{${bs}i0}`) && (await q("return document.querySelector('[data-tr-orig] .se-trcur')?.innerText;")) === "ตัวลาย");
  await c.key("Escape"); await sleep(200);
  check("Esc ปิดตัวช่วยแปล", !(await q("return !!document.querySelector('[data-translate]');")));
  await restore("ตัวช่วยแปล", 3);

  // ---------- ภาพเต็มหน้าไว้ประเมินหน้าตา (docs/REPORT-2026-11-14-ประเมินหน้าแก้ซับ.md) ----------
  await q(`const e = ${S}.get().doc.events; ${S}.select([e[${B}].id], e[${B}].id); return 1;`); await sleep(400);
  await c.shot(`${SHOT}/9-หน้าแก้ซับ-1280x800.png`);
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1032, deviceScaleFactor: 1, mobile: false }); await sleep(900);
  await c.shot(`${SHOT}/9b-หน้าแก้ซับ-1920x1032.png`);
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await sleep(600);

  // ---------- ซับ SRT ----------
  await q("window.__subClear(); window.__subOpen(" + JSON.stringify(SRT) + "); return 1;");
  await waitFor(`return ${S}.get().doc?.kind === 'srt' && !!document.querySelector('[data-cmdmenu=tool]');`, 15000);
  await sleep(500);
  const w1 = await menu("styles"), w2 = await menu("resample");
  check("ซับ SRT สไตล์กับเปลี่ยนความละเอียดกดไม่ได้ บอกให้เปลี่ยนเป็น ASS ก่อน", w1?.startsWith("ซับ SRT ไม่มีสไตล์") && w2?.startsWith("ซับ SRT ไม่มีสไตล์"), `${w1} / ${w2}`);
  await q(`const e = ${S}.get().doc.events; const i = e.findIndex((x) => x.text.includes('<')); const k = i < 0 ? 0 : i; ${S}.select([e[k].id], e[k].id); return 1;`); await sleep(150);
  check("ซับ SRT ตัวช่วยแปลใช้ได้", (await menu("translate")) === null && await waitFor("return !!document.querySelector('[data-translate]')", 3000));
  const so = await q("return [...document.querySelectorAll('[data-tr-orig] span')].map((s) => s.className + ':' + s.innerText);");
  check("แท็ก <i> ของ SRT เป็นท่อนแท็ก ไม่ต้องแปล", so.some((x) => x.startsWith("se-trtag:<")), JSON.stringify(so));
  await c.key("Escape"); await sleep(200);
} finally {
  await q(`try { localStorage.setItem('se-vauto', '1'); localStorage.removeItem('se-style-sample'); } catch {} return 1;`).catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  c.close();
}
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length} ข้อ`);
process.exit(ok === results.length ? 0 : 1);
