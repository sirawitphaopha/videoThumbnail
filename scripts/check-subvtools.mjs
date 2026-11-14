// ตัวตรวจ BUGS ข้อ 111 ส่วนที่สองและสาม เครื่องมือบนภาพของหน้าแก้ซับ (แบบ Aegisub visual_tool*.cpp กับเมนู video_context)
// ① ตรรกะพิกัดกับแท็กเทียบตัวเลขที่คิดมือจากซอร์ส Aegisub ผ่าน window.__subVisualLib
// ② ซับบนภาพนิ่งวาดด้วย libass ตำแหน่งตรง \pos กับระยะขอบ (อ่านค่าโปร่งใสของภาพซับ)
// ③ เครื่องมือกากบาท พิกัดตรงเมาส์ Shift กลับด้าน ดับเบิลคลิกย้ายบรรทัด · เครื่องมือลาก ลากเมาส์จริง Shift แกนเดียว สลับ \move กับ \pos จุดปลาย \move
//    ทุกการลากเป็นการแก้ขั้นเดียว เลิกทำแล้วเอกสารเหมือนเดิม
// ④ เมนูคลิกขวา บันทึกภาพ PNG สามแบบลงสำเนาหนังใน D:\dev\tmp (ชื่อไม่ทับกัน ขนาดตรง พื้นโปร่งใสเฉพาะแบบเฉพาะซับ) คัดลอกภาพแบบไม่แตะคลิปบอร์ด (window.__snapDry)
//    คัดลอกพิกัดลง window.__subClipOut · รีเซ็ตการเลื่อนภาพ · กดล้อเมาส์ค้างลากเลื่อนภาพ · ปุ่ม A S · ระหว่างเล่นหนังชั้นเครื่องมือหาย
// ใช้ตอนพี่กันทำงานอยู่ ไม่มีด่านหน้าต่างหน้าสุด · ภาพลง docs/report-2026-11-14/เครื่องมือบนภาพ/
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";
import { linesOf } from "./lib/lines.mjs";

const SRC = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv";
const TMP = "D:/dev/tmp/ชั้นแก้ซับเครื่องมือภาพ";
const MOVIE = `${TMP}/ฉากตัด (2025).mkv`;
const SHOT = "docs/report-2026-11-14/เครื่องมือบนภาพ";
const FF = "D:/movie-shelf/src-tauri/tools/ffmpeg.exe";
const FP = "D:/movie-shelf/src-tauri/tools/ffprobe.exe";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(SHOT, { recursive: true });
copyFileSync(SRC, MOVIE);

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const S = "window.__subEdit";
const L = "window.__subVisualLib";
const mouse = (type, x, y, extra = {}) => c.send("Input.dispatchMouseEvent", { type, x, y, ...extra });
/** ค่าสีของจุดหนึ่งในไฟล์ PNG [r g b a] ผ่าน ffmpeg */
const px = (file, x, y) => [...execFileSync(FF, ["-v", "error", "-i", file, "-vf", `crop=1:1:${x}:${y}`, "-f", "rawvideo", "-pix_fmt", "rgba", "-"])];
const probe = (file) => execFileSync(FP, ["-v", "error", "-show_entries", "stream=width,height,pix_fmt", "-of", "csv=p=0", file]).toString().trim();

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const keep = await q("try { return [localStorage.getItem('se-vzoom'), localStorage.getItem('se-vauto')]; } catch { return [null, null]; }");
try {
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  await q("[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().startsWith('ซับไตเติล'))?.click(); return 1;");
  await sleep(300);

  // ① ตรรกะ
  const lib = await q(`const l = ${L};
    const d = { kind: 'ass', styleFormat: ['Name','Fontname','Fontsize','PrimaryColour','SecondaryColour','OutlineColour','BackColour','Bold','Italic','Underline','StrikeOut','ScaleX','ScaleY','Spacing','Angle','BorderStyle','Outline','Shadow','Alignment','MarginL','MarginR','MarginV','Encoding'],
      styles: [{ id: 1, fields: ['Default','Arial','48','&H00FFFFFF','&H000000FF','&H00000000','&H00000000','0','0','0','0','100','100','0','0','1','2','2','2','40','30','36','1'], pre: [], raw: [] }],
      skeleton: [{ k: 'line', t: '[Script Info]', e: '\\n' }, { k: 'line', t: 'PlayResX: 1280', e: '\\n' }, { k: 'line', t: 'PlayResY: 720', e: '\\n' }], events: [] };
    const ev = (text, o = {}) => ({ id: 1, comment: false, layer: 0, start: 0, end: 1000, style: 'Default', actor: '', marginL: 0, marginR: 0, marginV: 0, effect: '', text, ident: null, suffix: '', pre: [], raw: [], ...o });
    const P = (v) => v.x + ',' + v.y;
    return {
      fts: [l.fts(640), l.fts(640.5), l.fts(1/3), l.fts(-0.0001), l.fts(12.3456)].join(' '),
      dstr: l.dStr({ x: 725.9, y: -3.7 }),
      def: P(l.linePosition(d, ev('สวัสดี'))),
      margin: P(l.linePosition(d, ev('ก', { marginL: 100, marginR: 20, marginV: 50 }))),
      an7: P(l.linePosition(d, ev('{\\\\an7}ก'))), an5: P(l.linePosition(d, ev('{\\\\an5}ก'))), an9: P(l.linePosition(d, ev('{\\\\an9}ก'))),
      a6: P(l.linePosition(d, ev('{\\\\a6}ก'))),
      pos: P(l.linePosition(d, ev('{\\\\b1\\\\pos(640.5,90)}ก'))), move: P(l.linePosition(d, ev('{\\\\move(10,20,30,40,100,200)}ก'))),
      mv: JSON.stringify(l.lineMove(ev('{\\\\move(10,20,30,40,100,200)}ก'))), mv4: JSON.stringify(l.lineMove(ev('{\\\\move(10,20,30,40)}ก'))),
      org: P(l.lineOrigin(ev('{\\\\org(5,6)}ก')) ?? { x: 'x', y: 'x' }),
      s1: l.setOverride('สวัสดี', 'pos', '(1,2)'),
      s2: l.setOverride('{\\\\b1\\\\pos(3,4)\\\\i1}ก', 'pos', '(1,2)'),
      s3: l.setOverride('{\\\\move(1,2,3,4)\\\\b1}ก', 'pos', '(9,9)'),
      s4: l.setOverride('{note}ก', 'pos', '(1,2)'),
      s5: l.setOverride('{\\\\t(0,100,\\\\pos(5,5))\\\\fs20}ก{\\\\pos(7,7)}', 'pos', '(1,2)'),
      s6: l.setOverride('{\\\\pos(1,2)}ก', 'move', '(1,2,3,4,0,0)'),
      sh: l.shiftText(d, ev('{\\\\move(10,20,30,40,100,200)\\\\org(5,5)}ก'), { x: 1.5, y: -2 }, l.vStr),
      sh2: l.shiftText(d, ev('{\\\\move(10,20,30,40)}ก'), { x: 1, y: 1 }, l.vStr),
    };`);
  check("float_to_string ตัดศูนย์ท้ายแบบ Aegisub", lib.fts === "640 640.5 0.333 -0 12.346", lib.fts);
  check("DStr ตัดทศนิยมทิ้งแบบ int ของ C++", lib.dstr === "725,-3", lib.dstr);
  check("ตำแหน่งตั้งต้น จัดกลางล่าง ระยะขอบจากสไตล์ (1280 + 40 - 30) / 2 กับ 720 - 36", lib.def === "645,684", lib.def);
  check("ระยะขอบของบรรทัดแทนของสไตล์", lib.margin === "680,670", lib.margin);
  check("\\an7 \\an5 \\an9 \\a6 (SSA เป็น ASS 8)", lib.an7 === "40,36" && lib.an5 === "645,360" && lib.an9 === "1250,36" && lib.a6 === "645,36", [lib.an7, lib.an5, lib.an9, lib.a6].join(" "));
  check("\\pos มาก่อน \\move มาเป็นจุดเริ่ม", lib.pos === "640.5,90" && lib.move === "10,20", lib.pos + " " + lib.move);
  check("อ่าน \\move ครบหกค่า ไม่ใส่เวลาเป็น 0", lib.mv === '{"p1":{"x":10,"y":20},"p2":{"x":30,"y":40},"t1":100,"t2":200}' && lib.mv4.endsWith('"t1":0,"t2":0}'), lib.mv + " " + lib.mv4);
  check("อ่าน \\org", lib.org === "5,6", lib.org);
  check("ใส่ \\pos บรรทัดที่ไม่มีกลุ่มแท็ก ได้กลุ่มใหม่หน้าบรรทัด", lib.s1 === "{\\pos(1,2)}สวัสดี", lib.s1);
  check("แทน \\pos เดิมในกลุ่มแรก ต่อท้ายกลุ่ม แท็กอื่นอยู่ครบ", lib.s2 === "{\\b1\\i1\\pos(1,2)}ก", lib.s2);
  check("ใส่ \\pos ลบ \\move ทิ้ง", lib.s3 === "{\\b1\\pos(9,9)}ก", lib.s3);
  check("กลุ่ม {} ที่ไม่มีแท็กเป็นความเห็น ใส่กลุ่มใหม่หน้า", lib.s4 === "{\\pos(1,2)}{note}ก", lib.s4);
  check("แท็กใน \\t กับกลุ่มอื่นไม่ถูกแตะ", lib.s5 === "{\\t(0,100,\\pos(5,5))\\fs20\\pos(1,2)}ก{\\pos(7,7)}", lib.s5);
  check("ใส่ \\move ลบ \\pos ทิ้ง", lib.s6 === "{\\move(1,2,3,4,0,0)}ก", lib.s6);
  check("ย้ายบรรทัด \\move คงเวลา \\org ย้ายด้วย", lib.sh === "{\\move(11.5,18,31.5,38,100,200)\\org(6.5,3)}ก", lib.sh);
  check("ย้ายบรรทัด \\move ที่ไม่มีเวลา ไม่เติมเวลา", lib.sh2 === "{\\move(11,21,31,41)}ก", lib.sh2);

  // ② เปิดสำเนาหนัง ภาพนิ่งมีซับจริง
  await q("try { localStorage.setItem('se-vauto', '0'); } catch {} window.__subClear(); window.__subOpen(" + JSON.stringify(MOVIE) + "); return 1;");
  check("เปิดสำเนาหนังทดสอบ อ่านเวลาเฟรมเสร็จ", await waitFor("return / - \\d+$/.test(document.querySelector('[data-vpos]')?.innerText ?? '')", 25000));
  if (await q("return document.querySelector('[data-vauto]')?.getAttribute('aria-pressed') === 'true'")) await c.click("[data-vauto]");
  await q("window.__vidLib.setZoom(50); window.__vidLib.seek(108); return 1;");
  check("ภาพนิ่งมีซับที่วาดด้วย libass วางทับ", await waitFor("return !!document.querySelector('[data-vsubimg][data-vsubnow]') && !document.querySelector('[data-vframe] .vsub')", 15000));
  const res = await q(`return window.__subStyleLib.playRes(${S}.get().doc);`);
  // ภาพบนจอ 320 × 180 (50% ของ 640 × 360) · ป้าย \pos(640,90) อยู่กลางบน · บทพูดอยู่กลางล่าง ขอบล่าง 36 ของ 720
  const alpha = await q(`const im = document.querySelector('[data-vsubimg]'); await im.decode(); const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const g = cv.getContext('2d'); g.drawImage(im, 0, 0);
    const sx = im.naturalWidth / 320, sy = im.naturalHeight / 180;
    const band = (y0, y1) => { const d = g.getImageData(Math.round(100 * sx), Math.round(y0 * sy), Math.round(120 * sx), Math.max(1, Math.round((y1 - y0) * sy))).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 128) n++; return n; };
    return { top: band(14, 30), mid: band(70, 110), bottom: band(140, 176), w: im.naturalWidth, h: im.naturalHeight };`);
  check("ซับป้ายบนอยู่ตรง \\pos(640,90) บทพูดอยู่ล่าง กลางภาพว่าง", alpha.top > 20 && alpha.bottom > 20 && alpha.mid === 0, JSON.stringify(alpha) + ` PlayRes ${res}`);
  await c.shot(`${SHOT}/1-ซับจริงบนภาพนิ่ง.png`, "[data-vbox]", 8);

  // ③ กากบาท
  const b = await c.box("[data-vtools]");
  const at = (sx, sy) => ({ x: b.left + sx, y: b.top + sy });
  check("ชั้นเครื่องมือเท่าภาพ 320 × 180 เริ่มที่เครื่องมือกากบาท", Math.round(b.w) === 320 && Math.round(b.h) === 180 && (await q("return document.querySelector('[data-vtools]').dataset.vtools")) === "cross", `${b.w} × ${b.h}`);
  let p0 = at(80, 45);
  await mouse("mouseMoved", p0.x, p0.y);
  await sleep(120);
  check("พิกัดตรงเมาส์ 80,45 บนจอเป็น 320,180 ของสคริปต์", (await q("return document.querySelector('[data-vxtext]')?.textContent")) === "320,180");
  await mouse("mouseMoved", p0.x, p0.y, { modifiers: 8 });
  await sleep(120);
  check("กด Shift พิกัดนับจากมุมขวาล่าง 960,540", (await q("return document.querySelector('[data-vxtext]')?.textContent")) === "960,540");
  await c.shot(`${SHOT}/2-กากบาท.png`, "[data-vbox]", 8);
  // บรรทัดป้าย \pos(640,90) เป็นบรรทัดที่กำลังแก้ ดับเบิลคลิกที่ 200,60 บนจอ ย้ายไป 800,240
  const sign = await q(`return ${S}.get().doc.events.find((e) => e.text.includes('\\\\pos(640,90)'))?.id ?? null;`);
  const textOf = (id) => q(`return ${S}.get().doc.events.find((e) => e.id === ${id})?.text;`);
  const orig = await textOf(sign);
  await q(`${S}.select([${sign}], ${sign}); return 1;`);
  const undo0 = await q(`return ${S}.get().undo.length;`);
  p0 = at(200, 60);
  await mouse("mouseMoved", p0.x, p0.y);
  await mouse("mousePressed", p0.x, p0.y, { button: "left", buttons: 1, clickCount: 1 });
  await mouse("mouseReleased", p0.x, p0.y, { button: "left", buttons: 0, clickCount: 1 });
  await mouse("mousePressed", p0.x, p0.y, { button: "left", buttons: 1, clickCount: 2 });
  await mouse("mouseReleased", p0.x, p0.y, { button: "left", buttons: 0, clickCount: 2 });
  await sleep(150);
  const dbl = await textOf(sign);
  check("ดับเบิลคลิกด้วยกากบาท ย้ายบรรทัดไป \\pos(800,240) เป็นการแก้ขั้นเดียว", dbl === orig.replace("\\pos(640,90)", "\\pos(800,240)") && (await q(`return ${S}.get().undo.length;`)) === undo0 + 1, dbl);
  await q(`${S}.undo(); return 1;`);
  check("เลิกทำ ข้อความกลับเหมือนเดิม", (await textOf(sign)) === orig);

  // ปุ่ม S เปลี่ยนเป็นเครื่องมือลาก (คลิกภาพไว้แล้ว)
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "s", code: "KeyS", windowsVirtualKeyCode: 83 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "s", code: "KeyS", windowsVirtualKeyCode: 83 });
  check("กด S ตอนคลิกภาพไว้ ได้เครื่องมือลาก", await waitFor("return document.querySelector('[data-vtools]')?.dataset.vtools === 'drag'", 2000));
  const feats = await q("return [...document.querySelectorAll('[data-vfeat]')].map((g) => g.dataset.vfeat + ':' + g.dataset.vline + (g.dataset.vsel ? '*' : '')).join(' ');");
  check("จุดจับของสองบรรทัดที่ขึ้นบนภาพ บรรทัดที่เลือกเป็นสีที่เลือก", feats.split(" ").length === 2 && feats.includes(`start:${sign}*`), feats);
  await c.shot(`${SHOT}/3-เครื่องมือลาก.png`, "[data-vbox]", 8);
  // ลากจุดของป้ายจาก 160,22.5 ไป +30,+10 ได้ \pos(760,130)
  const undo1 = await q(`return ${S}.get().undo.length;`);
  let s0 = at(160, 22.5);
  await c.drag(s0.x, s0.y, s0.x + 30, s0.y + 10, { steps: 6 });
  await sleep(150);
  const dragged = await textOf(sign);
  check("ลากจุด \\pos ด้วยเมาส์ ได้ \\pos(760,130) ทั้งการลากเป็นการแก้ขั้นเดียว", dragged === orig.replace("\\pos(640,90)", "\\pos(760,130)") && (await q(`return ${S}.get().undo.length;`)) === undo1 + 1, dragged);
  await sleep(500);
  await c.shot(`${SHOT}/4-ลากแล้ว.png`, "[data-vbox]", 8);
  await q(`${S}.undo(); return 1;`);
  await sleep(150);
  s0 = at(160, 22.5);
  await c.drag(s0.x, s0.y, s0.x + 30, s0.y + 5, { steps: 6, modifiers: 8 });
  await sleep(150);
  check("ลากโดยกด Shift เลื่อนแนวนอนอย่างเดียว \\pos(760,90)", (await textOf(sign)) === orig.replace("\\pos(640,90)", "\\pos(760,90)"), await textOf(sign));
  await q(`${S}.undo(); return 1;`);
  check("เลิกทำ ข้อความกลับเหมือนเดิม", (await textOf(sign)) === orig);

  // สลับเป็น \move แล้วลากจุดปลาย เวลาของจุดปลายเป็นเวลาของภาพที่เห็นลบเวลาเริ่มของบรรทัด
  await q(`${S}.select([${sign}], ${sign}); return 1;`);
  await sleep(100);
  await c.click("[data-vtool=movepos]");
  await sleep(150);
  const exp = await q(`const fr = window.__vidLib.rate(); const e = ${S}.get().doc.events.find((x) => x.id === ${sign}); const s = e.start; const t1 = Math.round(fr.timeAt(fr.frameAt(s, 'start')) - s), t2 = Math.round(fr.timeAt(fr.frameAt(s, 'end')) - s), now = Math.round(fr.timeAt(108) - s); return { t1, t2, now };`);
  const mv = await textOf(sign);
  check("ปุ่มสลับ ได้ \\move อยู่กับที่ เวลาปัดเข้าขอบเฟรมตามเวลาเริ่ม", mv === orig.replace("\\pos(640,90)", `\\move(640,90,640,90,${exp.t1},${exp.t2})`), mv);
  await sleep(150);
  s0 = at(160, 22.5);
  await c.drag(s0.x, s0.y, s0.x + 20, s0.y, { steps: 5 });
  await sleep(150);
  const end = await textOf(sign);
  check("จุดปลายวงกลมอยู่บนสุด ลากแล้วได้จุดปลาย 720,90 เวลาปลายเป็นเวลาของภาพ", end === orig.replace("\\pos(640,90)", `\\move(640,90,720,90,${exp.t1},${exp.now})`), end + ` คาด t2 ${exp.now}`);
  await sleep(500);
  await c.shot(`${SHOT}/5-move-ลูกศร.png`, "[data-vbox]", 8);
  await c.click("[data-vtool=movepos]");
  await sleep(150);
  check("กดสลับอีกครั้ง \\move เป็น \\pos ที่จุดเริ่ม", (await textOf(sign)) === orig);
  await q(`${S}.undo(); ${S}.undo(); ${S}.undo(); return 1;`);
  check("เลิกทำสามครั้ง กลับเหมือนเดิม", (await textOf(sign)) === orig);

  // ④ เมนูคลิกขวา
  const rclick = async (sx, sy) => { const p = at(sx, sy); await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { button: "right", buttons: 2, clickCount: 1 }); await mouse("mouseReleased", p.x, p.y, { button: "right", buttons: 0, clickCount: 1 }); await sleep(200); };
  await rclick(150, 100);
  const items = await q("return [...document.querySelectorAll('[data-vctx]')].map((x) => x.dataset.vctx + (x.getAttribute('aria-disabled') ? '-' : '')).join(' ');");
  check("คลิกขวาเปิดเมนู 8 คำสั่งเรียงแบบ Aegisub รีเซ็ตการเลื่อนภาพกดไม่ได้ตอนภาพยังไม่ถูกเลื่อน", items === "save copy save-raw copy-raw save-only copy-only coords pan-", items);
  const mr = await q("const r = document.querySelector('[data-vctxmenu]').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, W: innerWidth, H: innerHeight };");
  check("เมนูอยู่ในจอ", mr.l >= 0 && mr.t >= 0 && mr.r <= mr.W && mr.b <= mr.H, JSON.stringify(mr));
  await c.shot(`${SHOT}/6-เมนูคลิกขวา.png`, "[data-vctxmenu]", 10);
  await q("window.__subClipOut = []; return 1;");
  await c.click("[data-vctx=coords]");
  await sleep(150);
  check("คัดลอกพิกัด 600,400", JSON.stringify(await q("return window.__subClipOut;")) === '["600,400"]' && /คัดลอกพิกัด 600,400 แล้ว/.test(await q("return document.querySelector('[data-vnote]')?.innerText ?? ''")));
  const shots = [];
  for (const [mode, label] of [["save", "มีซับ"], ["save-raw", "ไม่มีซับ"], ["save-only", "เฉพาะซับ"]]) {
    await rclick(150, 100);
    await c.click(`[data-vctx=${mode}]`);
    const ok = await waitFor("return document.querySelector('[data-vnote]')?.dataset.vnote === 'ok' && /บันทึกภาพแล้ว/.test(document.querySelector('[data-vnote]').innerText)", 20000);
    shots.push([label, ok, await q("return document.querySelector('[data-vnote]')?.innerText")]);
    await sleep(100);
  }
  const files = readdirSync(TMP).filter((f) => f.endsWith(".png")).sort();
  check("บันทึกสามแบบ ได้สามไฟล์ข้างหนัง ชื่อนับลำดับไม่ทับกัน", shots.every((s) => s[1]) && files.join(" ") === "ฉากตัด (2025)_001_108.png ฉากตัด (2025)_002_108.png ฉากตัด (2025)_003_108.png", files.join(" "));
  if (files.length === 3) {
    const [f1, f2, f3] = files.map((f) => `${TMP}/${f}`);
    const p1 = probe(f1), p2 = probe(f2), p3 = probe(f3);
    check("ทุกไฟล์ขนาดเต็มของหนัง 640 × 360 แบบเฉพาะซับมีช่องโปร่งใส", p1.startsWith("640,360") && p2.startsWith("640,360") && p3 === "640,360,rgba", [p1, p2, p3].join(" | "));
    // ป้ายสีเหลืองสไตล์จัดกลางบน (alignment 8) \pos(640,90) ของสคริปต์ 1280 × 720 คือขอบบนของตัวอักษรที่ 320,45 ของภาพ 640 × 360 ตัวอักษรอยู่ใต้จุดนั้น
    const scan = (f) => { const raw = [...execFileSync(FF, ["-v", "error", "-i", f, "-vf", "crop=140:12:250:48", "-f", "rawvideo", "-pix_fmt", "rgba", "-"])]; let n = 0; for (let i = 0; i < raw.length; i += 4) if (raw[i] > 200 && raw[i + 1] > 170 && raw[i + 2] < 90 && raw[i + 3] > 200) n++; return n; };
    const y1 = scan(f1), y2 = scan(f2), y3 = scan(f3);
    const corner = px(f3, 5, 5), corner1 = px(f1, 5, 5);
    check("มีซับเห็นป้ายเหลือง ไม่มีซับไม่เห็น เฉพาะซับเห็นป้ายบนพื้นโปร่งใส มุมภาพของแบบมีซับทึบ", y1 > 2 && y2 === 0 && y3 > 2 && corner[3] === 0 && corner1[3] === 255, `เหลือง ${y1} ${y2} ${y3} มุม ${corner} ${corner1}`);
  }
  await q("window.__snapDry = true; return 1;");
  for (const mode of ["copy", "copy-raw", "copy-only"]) {
    await rclick(150, 100);
    await c.click(`[data-vctx=${mode}]`);
    await waitFor("return document.querySelector('[data-vnote]')?.dataset.vnote === 'ok' && /คัดลอกภาพแล้ว/.test(document.querySelector('[data-vnote]').innerText)", 20000);
  }
  const ls = await q("return window.__lastSnap;");
  check("คัดลอกภาพ (ทางลัดไม่แตะคลิปบอร์ด) วาดภาพ 640 × 360 สำเร็จ", ls && ls.w === 640 && ls.h === 360 && ls.path === null, JSON.stringify(ls));
  await q("delete window.__snapDry; return 1;");
  await c.shot(`${SHOT}/7-แจ้งผล.png`, "[data-vbox]", 8);
  check("แจ้งผลสำเร็จหายเองใน 4 วินาที", await waitFor("return !document.querySelector('[data-vnote]')", 6000));

  // เลื่อนภาพ ขยาย 200% ลากด้วยล้อเมาส์ แล้วรีเซ็ต
  await q("window.__vidLib.setZoom(200); return 1;");
  await sleep(600);
  const v0 = await q("const v = document.querySelector('[data-vframe]'); return { l: v.scrollLeft, t: v.scrollTop, cw: v.clientWidth, sw: v.scrollWidth, ch: v.clientHeight, sh: v.scrollHeight };");
  const vb = await c.box("[data-vframe]");
  await c.drag(vb.x, vb.y, vb.x - 60, vb.y - 30, { button: "middle", steps: 4 });
  await sleep(100);
  const v1 = await q("const v = document.querySelector('[data-vframe]'); return { l: v.scrollLeft, t: v.scrollTop };");
  check("กดล้อเมาส์ค้างลาก ภาพเลื่อนตาม", v1.l - v0.l === 60 && v1.t - v0.t === 30, JSON.stringify([v0, v1]));
  await mouse("mousePressed", vb.x, vb.y, { button: "right", buttons: 2, clickCount: 1 });
  await mouse("mouseReleased", vb.x, vb.y, { button: "right", buttons: 0, clickCount: 1 });
  await sleep(200);
  const panOn = await q("return !document.querySelector('[data-vctx=pan]').getAttribute('aria-disabled');");
  await c.click("[data-vctx=pan]");
  await sleep(100);
  const v2 = await q("const v = document.querySelector('[data-vframe]'); return { l: v.scrollLeft, t: v.scrollTop, cl: (v.scrollWidth - v.clientWidth) / 2, ct: (v.scrollHeight - v.clientHeight) / 2 };");
  check("รีเซ็ตการเลื่อนภาพ ภาพกลับมากลางกรอบ", panOn && Math.abs(v2.l - v2.cl) <= 1 && Math.abs(v2.t - v2.ct) <= 1, JSON.stringify(v2));
  await q("window.__vidLib.setZoom(50); return 1;");
  await sleep(300);

  // ล้อเมาส์แบบ Aegisub · หมุนเปล่าปรับขนาดภาพ · Ctrl ขยายเนื้อภาพตรงจุดที่ชี้ในกรอบเดิม · Shift เลื่อนภาพ 5 จุดต่อรอบ
  const imgSz = () => q("const i = document.querySelector('[data-vframe] .se-vimg > img'); const v = document.querySelector('[data-vframe]').getBoundingClientRect(); return { w: parseFloat(i.style.width), h: parseFloat(i.style.height), bw: Math.round(v.width), bh: Math.round(v.height) };");
  const wheel = async (sx, sy, dy, modifiers = 0) => { const p = at(sx, sy); await mouse("mouseMoved", p.x, p.y); await mouse("mouseWheel", p.x, p.y, { deltaX: 0, deltaY: dy, modifiers }); await sleep(250); };
  await wheel(160, 90, -100);
  const w1 = await imgSz();
  await wheel(160, 90, 100);
  const w2 = await imgSz();
  check("หมุนล้อขึ้นไม่กดอะไร ภาพ 50% เป็น 62.5% (400 × 225) หมุนลงกลับ 320 × 180", w1.w === 400 && w1.h === 225 && w2.w === 320 && w2.h === 180, JSON.stringify([w1, w2]));
  // ชี้ที่ 240,45 ของภาพ (สามในสี่ของความกว้าง หนึ่งในสี่ของความสูง) แล้วขยายเนื้อภาพ จุดนั้นต้องอยู่ใต้เมาส์ที่เดิม
  const frac = (sx, sy) => q(`const v = document.querySelector('[data-vframe]'); const i = v.querySelector('.se-vimg > img'); const r = i.getBoundingClientRect(); const vr = v.getBoundingClientRect(); return [(${b.left + sx} - r.left) / r.width, (${b.top + sy} - r.top) / r.height];`);
  const f0 = await frac(240, 45);
  await wheel(240, 45, -100, 2);
  await wheel(240, 45, -100, 2);
  const c1 = await imgSz(), f1 = await frac(240, 45);
  check("Ctrl กับล้อขึ้นสองรอบ เนื้อภาพขยาย 1.125 ยกกำลังสอง กรอบเท่าเดิม 320 × 180", c1.w === 405 && c1.h === 228 && c1.bw === 320 && c1.bh === 180, JSON.stringify(c1));
  check("จุดที่ชี้อยู่ใต้เมาส์ที่เดิมหลังขยายเนื้อภาพ", Math.abs(f1[0] - f0[0]) < 0.01 && Math.abs(f1[1] - f0[1]) < 0.01, JSON.stringify([f0, f1]));
  const st0 = await q("return document.querySelector('[data-vframe]').scrollTop;");
  await wheel(160, 90, 100, 8);
  const st1 = await q("return document.querySelector('[data-vframe]').scrollTop;");
  check("Shift กับล้อลงหนึ่งรอบ ภาพเลื่อนลง 5 จุด", st1 - st0 === 5, `${st0} → ${st1}`);
  await rclick(150, 100);
  const panCz = await q("return !document.querySelector('[data-vctx=pan]').getAttribute('aria-disabled');");
  await c.click("[data-vctx=pan]");
  await sleep(200);
  const c2 = await imgSz();
  check("เนื้อภาพขยายอยู่ รีเซ็ตการเลื่อนภาพกดได้ กดแล้วเนื้อภาพกลับ 320 × 180", panCz && c2.w === 320 && c2.h === 180, JSON.stringify(c2));

  // กล่อง ⓘ ทั้งสามตัดบรรทัดตรงรอยต่อของความหมายที่หน้าต่าง 1280 × 800 (กฎตัดบรรทัดตามความหมาย · พี่กันตีตกกล่องที่แตกบรรทัดละวลี 14 พ.ย. 2569)
  // ค่าที่คาดคือจุดตัดที่อ่านแล้วว่าตรงความหมาย ฟอนต์ ความกว้างกล่อง หรือข้อความเปลี่ยน ตัวตรวจแดงให้อ่านจุดตัดใหม่
  const esc = async () => { await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await sleep(200); };
  const TIP_VIDEO = ["แถบใต้ภาพมีปุ่มถอยหรือเดินทีละเฟรม ⏎ ส่วนช่องกลางบอกเวลากับเลขเฟรม และเป็นสีเข้มเมื่อเป็น keyframe", "ตัวเลขมุมขวาบน คือระยะห่างจากเวลาเริ่มและเวลาจบของบรรทัดนี้ ⏎ ถ้าเป็น +0ms แปลว่าภาพอยู่ตรงเวลาเริ่มพอดี", "เดินทีละเฟรม คลิกภาพแล้วกดลูกศรซ้ายขวา ⏎ กด Shift ด้วยจะไป keyframe กด Ctrl ด้วยจะไปขอบบรรทัด ⏎ และกด Alt ด้วยจะเดินทีละ 10 เฟรม", "คีย์ลัด กด Ctrl+1 เพื่อไปเวลาเริ่ม กด Ctrl+2 เพื่อไปเวลาจบ ⏎ และกด Ctrl+G เพื่อข้ามไปเฟรมหรือเวลาที่พิมพ์", "ล้อเมาส์ หมุนบนภาพเพื่อปรับขนาด กด Ctrl ด้วยจะขยายเนื้อภาพ ⏎ ส่วนกด Shift ด้วยหรือกดล้อค้างแล้วลากจะเลื่อนภาพ", "AUTO เลือกบรรทัดแล้วภาพไปเวลาเริ่มของบรรทัดนั้นเอง ⏎ ข้อดีไล่ดูบรรทัดได้เร็ว ⏎ ข้อเสียภาพที่ดูค้างไว้จะกระโดดไปเมื่อเลือกบรรทัดใหม่", "แนะนำเปิด AUTO ไว้ ตอนจะดูภาพนานค่อยปิด"];
  const TIP_TOOLS = ["ใช้ได้ตอนภาพหยุดอยู่ พิกัดนับจากมุมซ้ายบนของภาพ ⏎ ตามความละเอียดของสคริปต์ จึงเป็นตัวเลขชุดเดียวกับใน \\pos", "กากบาท (A) ชี้ภาพแล้วเห็นพิกัด ⏎ ดับเบิลคลิกเพื่อย้ายบรรทัดที่เลือกมาตรงนั้น ⏎ ข้อดีดูพิกัดได้ทันที ⏎ ข้อเสียไม่เห็นจุดจับของซับ", "ลากจัดตำแหน่ง (S) ลากจุดบนภาพแล้วซับย้ายตาม สี่เหลี่ยมคือ \\pos ⏎ ส่วนวงกลมคือปลายของ \\move และสามเหลี่ยมคือ \\org ⏎ ข้อดีลากหลายบรรทัดพร้อมกันได้ ⏎ ข้อเสียเวลาของจุดใน \\move เปลี่ยนตามภาพที่เห็นตอนลาก", "คลิกขวา บันทึกภาพ คัดลอกภาพ หรือคัดลอกพิกัด", "แนะนำจัดตำแหน่งด้วยเครื่องมือลาก ส่วนดูพิกัดใช้กากบาท"];
  const TIP_COORD = ["เป็นตัวเลขชุดเดียวกับที่ใส่ใน \\pos ของซับ คัดลอกแล้ววางได้เลย"];
  const tipCheck = async (name, sel, want) => {
    const got = await linesOf(q, sel);
    const bad = (got ?? []).filter((l, i) => l !== want[i]);
    check(`กล่อง ⓘ ${name} ตัดบรรทัดตรงที่คาดทุกย่อหน้า`, !!got && got.length === want.length && !bad.length, bad.join(" | ") || `${got?.length} ย่อหน้า`);
  };
  await esc();
  await c.click("[data-vmenu]"); await sleep(300);
  await c.click('[data-vmenupanel] [data-info="กรอบวิดีโอ"]'); await sleep(400);
  await tipCheck("กรอบวิดีโอ", '.infotip[data-tip="กรอบวิดีโอ"]', TIP_VIDEO);
  await esc(); await esc();
  await c.click(".se-vtinfo button"); await sleep(400);
  await tipCheck("เครื่องมือบนภาพ", '.infotip[data-tip="เครื่องมือบนภาพ"]', TIP_TOOLS);
  await esc();
  await rclick(150, 100);
  await c.click('[data-vctxmenu] [data-info="พิกัด"]'); await sleep(400);
  await tipCheck("พิกัด", '.infotip[data-tip="พิกัด"]', TIP_COORD);
  await esc(); await esc();

  // Esc ปิดเมนู
  await rclick(150, 100);
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  check("Esc ปิดเมนูคลิกขวา", await waitFor("return !document.querySelector('[data-vctxmenu]')", 2000));

  // ปุ่ม A กลับเป็นกากบาท
  await c.click("[data-vframe]");
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65 });
  check("กด A ได้เครื่องมือกากบาท", await waitFor("return document.querySelector('[data-vtools]')?.dataset.vtools === 'cross'", 2000));

  // เล่นหนัง ชั้นเครื่องมือกับซับจาก libass หาย หยุดแล้วกลับมา
  await c.click("[data-vplay]");
  const gone = await waitFor("return document.querySelector('[data-vplay]')?.getAttribute('aria-pressed') === 'true' && !document.querySelector('[data-vtools]') && !document.querySelector('[data-vsubimg]')", 8000);
  await sleep(600);
  await c.click("[data-vplay]");
  const back = await waitFor("return document.querySelector('[data-vplay]')?.getAttribute('aria-pressed') === 'false' && !!document.querySelector('[data-vtools]')", 8000);
  check("ระหว่างเล่นชั้นเครื่องมือกับซับภาพนิ่งหาย หยุดแล้วกลับมา", gone && back);
  check("หลังทุกขั้น เอกสารไม่ค้างแก้", (await textOf(sign)) === orig);
} finally {
  await q(`try { ${keep[0] == null ? "localStorage.removeItem('se-vzoom')" : `localStorage.setItem('se-vzoom', ${JSON.stringify(keep[0])})`}; ${keep[1] == null ? "localStorage.removeItem('se-vauto')" : `localStorage.setItem('se-vauto', ${JSON.stringify(keep[1])})`}; } catch {} delete window.__snapDry; window.__subClear(); return 1;`).catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  c.close();
  try { rmSync(TMP, { recursive: true, force: true }); } catch { console.log("ลบโฟลเดอร์ทดสอบไม่ได้ หนังอาจยังถูกเปิดอยู่"); }
}
const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
process.exit(pass === results.length ? 0 : 1);
