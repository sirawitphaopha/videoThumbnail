// ตัวตรวจชุด BUGS ข้อ 113 ถึง 121 (14 พ.ย. 2569) · ทำงานกับโปรแกรมโหมดพัฒนาที่เปิดอยู่หลังสุด (scripts/dev-app.ps1)
// 113 แถบปุ่มย่อแบบ Aegisub ในแถวเหนือตาราง กลุ่มที่ไม่พอที่อยู่ในเมนูปุ่มอื่น ทุกปุ่มทำงาน · แถวแคบปุ่มคำสั่งเหลือไอคอน · หน้าต่างคุณสมบัติสคริปต์
//     แถบเลื่อนเวลาใต้ภาพ (คลิก ลาก Shift ดูด keyframe ล้อเมาส์) · ปุ่มเล่น เล่นเฉพาะบรรทัด หยุด · ปุ่มรหัสอักษรสูงเท่าปุ่มอื่น
// 114 รายการสิ่งที่ MP4 เก็บไม่ได้ · หน้าต่างใส่ซับกลับเข้าหนังบอกฟอนต์ที่ฝังเพิ่ม (ใส่จริงตรวจใน cargo test)
// 115 แหล่งเสียงของหนังมีเวลาเฟรมแรกของภาพ ไฟล์ที่ภาพเริ่มช้า 0.3 วินาทีได้ 0.3
// 116 117 เมนูซ้ายตอนพับมีคำอังกฤษใต้ไอคอน ไม่ล้น ไม่ทับจุดตัวเลข ปุ่มสูงเท่าเดิม · ไอคอนตั้งค่าเป็นฟันเฟือง
// 118 หน้าต่างส่งออก PGS เตือนข้อจำกัด ส่งออกจริงลงโฟลเดอร์ทดสอบ ffprobe อ่านไฟล์ได้ ชื่อชนต่อเลข
// 119 หน้าบิตเรตไฟล์ FLAC เส้นเพดานเป็นบิตเรตเสียงดิบ บอกเปอร์เซ็นต์ ปุ่มไปหน้ากราฟเสียง
// 120 121 แผงตั้งค่าเสียงใช้ผลลองแปลงจริง ใกล้ขนาดจริง · คำเตือนบอกกี่เท่า · แปลงเสร็จติ๊กเขียวเสียงเหมือนต้นฉบับทุกบิต
// ด่านหน้าต่างหน้าสุดตอนเริ่มและก่อนกดหรือพิมพ์ทุกครั้ง (ตรวจซ้ำทุก 3 วินาที) ตอนพี่กันทำงานอยู่ส่ง NOGATE=1 · ไม่แตะคลิปบอร์ด · ไม่เปิดกล่องเลือกไฟล์ · ภาพลง docs/report-2026-11-14/ชุด113/
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";

// ด่านหน้าต่างหน้าสุด (CLAUDE.md กฎกันหน้าจอเด้งข้อ ②) หน้าต่างชั้นหนังขึ้นมาอยู่หน้าสุดเมื่อไหร่ หยุดทันที ไม่กดต่อ
let gateAt = 0;
const guard = () => {
  if (process.env.NOGATE === "1" || Date.now() - gateAt < 3000) return;
  try { execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/fg-gate.ps1"], { stdio: "ignore" }); }
  catch { console.log("หน้าต่างชั้นหนังอยู่หน้าสุดของจอ หยุดตรวจ"); process.exit(2); }
  gateAt = Date.now();
};
guard();

const SRC = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv";
const AUD = "D:/movie-shelf/test-media/สร้าง/เสียงซับ";
const TMP = "D:/dev/tmp/ชั้นชุด113";
const MOVIE = `${TMP}/ฉากตัด (2025).mkv`;
const LATE = `${TMP}/ภาพเริ่มช้า.mkv`;
const SHOT = "docs/report-2026-11-14/ชุด113";
const FF = "D:/movie-shelf/src-tauri/tools/ffmpeg.exe";
const FP = "D:/movie-shelf/src-tauri/tools/ffprobe.exe";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(SHOT, { recursive: true });
copyFileSync(SRC, MOVIE);
copyFileSync(`${AUD}/เพลงทดสอบ 96k.flac`, `${TMP}/เพลง 96k.flac`);
copyFileSync(`${AUD}/เพลงทดสอบ.mp3`, `${TMP}/เพลง.mp3`);
// หนังที่ภาพเริ่มช้ากว่าเสียง 0.3 วินาที มีซับหนึ่งแทร็ก (BUGS ข้อ 115)
execFileSync(FF, ["-v", "error", "-itsoffset", "0.3", "-f", "lavfi", "-i", "color=c=navy:s=320x180:r=25:d=4", "-f", "lavfi", "-i", "sine=frequency=700:sample_rate=48000:duration=4",
  "-f", "srt", "-i", "-", "-map", "0:v", "-map", "1:a", "-map", "2:s", "-c:v", "libx264", "-c:a", "aac", "-c:s", "srt", LATE], { input: "1\r\n00:00:00,500 --> 00:00:02,000\r\nทดสอบ\r\n" });

const c = await connect();
// ทุกคำสั่งที่กดหรือพิมพ์ผ่านด่านก่อน รวมคำสั่งเมาส์และแป้นที่ส่งตรงผ่าน send
for (const k of ["click", "drag", "key", "type", "move", "hover"]) { const f = c[k]; c[k] = (...a) => { guard(); return f(...a); }; }
{ const send = c.send; c.send = (m, p) => { if (String(m).startsWith("Input.")) guard(); return send(m, p); }; }
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const size = async (w, h) => { await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(500); };
const S = "window.__subEdit";
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.getAttribute('aria-label')?.startsWith(${JSON.stringify(label)}) || b.innerText.trim().startsWith(${JSON.stringify(label)}))?.click(); return 1;`);
const esc = async () => { await c.key("Escape"); await sleep(250); };
/** กดปุ่มในแถบปุ่มย่อ · ถ้าไม่พอที่อยู่ในเมนูปุ่มอื่น เปิดเมนูแล้วกด */
const tb = async (id) => {
  if (await q(`return !!document.querySelector('[data-tb="${id}"]')`)) { await c.click(`[data-tb="${id}"]`); return "bar"; }
  await c.click("[data-tb-more]"); await sleep(250);
  await c.click(`[data-tbm="${id}"]`); return "more";
};
const doc = () => q(`return JSON.stringify(${S}.get().doc)`);

const keep = await q("try { return [localStorage.getItem('se-vzoom'), localStorage.getItem('se-vauto')]; } catch { return [null, null]; }");
await size(1280, 800);
try {
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(3000);
  // เมนูซ้ายพับไว้ก่อน (สภาพที่พี่กันใช้) ไล่คำใต้ไอคอนทีหลัง
  const wasMini = await q("return document.querySelector('.side')?.classList.contains('mini-nav')");

  /* ---------------------------------------------------------------- 116 117 เมนูซ้าย */
  if (!wasMini) { await c.click(".navtoggle"); await sleep(600); }
  const sb = await q(`const navs = [...document.querySelectorAll('.side .nav')];
    return navs.map((n) => { const r = n.getBoundingClientRect(), w = n.querySelector('.naven'), cnt = n.querySelector('.count'), svg = n.querySelector('svg');
      const wr = w?.getBoundingClientRect(), cr = cnt?.getBoundingClientRect(), sr = svg?.getBoundingClientRect();
      return { en: w?.innerText ?? '', op: w ? getComputedStyle(w).opacity : '0', h: Math.round(r.height), nw: Math.round(r.width), ww: wr ? Math.ceil(w.scrollWidth) : 0, wl: wr ? Math.round(wr.left - r.left) : 0, wr: wr ? Math.round(r.right - wr.right) : 0,
        overCnt: !!(wr && cr && !(cr.bottom <= wr.top || cr.top >= wr.bottom || cr.right <= wr.left || cr.left >= wr.right)), iconAbove: !!(wr && sr && sr.bottom <= wr.top + 1) }; });`);
  const words = sb.map((x) => x.en).join(" ");
  check("เมนูพับ คำอังกฤษใต้ไอคอนครบทุกปุ่ม", words === "Shelf Poster Link Tracks Subtitle Check Audio Bitrate Info Settings Expand", words);
  check("คำขึ้นชัด (ทึบเต็ม) ทุกปุ่มตอนพับ", sb.every((x) => x.op === "1"), sb.map((x) => x.op).join(" "));
  check("คำไม่ล้นปุ่ม ทุกคำกว้างไม่เกินปุ่ม", sb.every((x) => x.ww <= x.nw && x.wl >= 0 && x.wr >= 0), sb.map((x) => `${x.en} ${x.ww}/${x.nw}`).join(" "));
  check("คำอยู่ใต้ไอคอน ไม่ทับจุดตัวเลข", sb.every((x) => x.iconAbove && !x.overCnt), sb.filter((x) => !x.iconAbove || x.overCnt).map((x) => x.en).join(" ") || "ครบ");
  const miniH = sb[0].h;
  check("ปุ่มเมนูตอนพับสูงเท่ากันทุกปุ่ม", sb.every((x) => x.h === miniH), sb.map((x) => x.h).join(" "));
  await c.shotRect(`${SHOT}/01-เมนูพับคำใต้ไอคอน.png`, 0, 30, 70, 760);
  await c.click(".navtoggle"); await sleep(600);
  const wide = await q(`return [...document.querySelectorAll('.side .nav')].map((n) => { const w = n.querySelector('.naven'); return [getComputedStyle(w).visibility, Math.round(n.getBoundingClientRect().height)]; })`);
  // ตอนกางสูง 42 มาแต่เดิม (ระยะบนล่าง 9 กับบรรทัด 24) ตอนพับต้องเท่ากัน กดย่อขยายแล้วปุ่มไม่กระโดด
  check("เมนูกาง ซ่อนคำอังกฤษ ปุ่มสูงเท่าตอนพับ ไม่กระโดด", wide.every(([v, h]) => v === "hidden" && h === miniH), `พับ ${miniH} กาง ${JSON.stringify(wide.slice(0, 3))}`);
  const gear = await q("return document.querySelector('.side .nav[aria-label=\"ตั้งค่า\"] svg path')?.getAttribute('d')?.slice(0, 12)");
  check("ไอคอนตั้งค่าในเมนูซ้ายเป็นฟันเฟือง", gear === "M18.86 10.16", gear);
  await c.shotRect(`${SHOT}/02-ไอคอนฟันเฟือง.png`, 0, 30, 210, 600);
  if (wasMini) { await c.click(".navtoggle"); await sleep(600); }

  /* ---------------------------------------------------------------- 113 หน้าแก้ซับ */
  await nav("ซับไตเติล"); await sleep(400);
  await q(`try { localStorage.setItem('se-vauto', '0'); } catch {} window.__subClear(); window.__subOpen(${JSON.stringify(MOVIE)}); return 1;`);
  check("เปิดสำเนาหนังทดสอบ อ่านเวลาเฟรมเสร็จ", await waitFor("return / - \\d+$/.test(document.querySelector('[data-vpos]')?.innerText ?? '')", 25000));
  if (await q("return document.querySelector('[data-vauto]')?.getAttribute('aria-pressed') === 'true'")) await c.click("[data-vauto]");
  await q("window.__vidLib.setZoom(0); return 1;");
  await sleep(500);
  const hEnc = await q("const u = document.querySelector('[data-se-undo]').getBoundingClientRect().height, e = document.querySelector('[data-se-tools] .se-enc .dd').getBoundingClientRect().height, t = document.querySelector('[data-se-tools]').getBoundingClientRect().height; return [Math.round(u), Math.round(e), Math.round(t)];");
  check("ปุ่มรหัสอักษรสูงเท่าปุ่มเลิกทำ แถวบนเตี้ยลงจาก 44", hEnc[0] === hEnc[1] && hEnc[2] <= 39, hEnc.join(" "));

  // ผังแถวเหนือตารางสามขนาด ไม่มีปุ่มซ้อน ไม่ล้น ปุ่มที่เห็นกับในเมนูรวมกันครบ 18
  for (const [w, h] of [[1280, 800], [1600, 852], [1920, 1032]]) {
    await size(w, h);
    const lay = await q(`const g = document.querySelector('[data-se-gridbar]'); const rs = [...g.querySelectorAll('button, .se-gslot, .seg')].filter((b) => !b.closest('.menu')).map((b) => b.getBoundingClientRect()).filter((r) => r.width > 0);
      let overlap = 0; for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) { const a = rs[i], b = rs[j]; if (a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) { const inA = b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom, inB = a.left >= b.left && a.right <= b.right && a.top >= b.top && a.bottom <= b.bottom; if (!inA && !inB) overlap++; } }
      const bar = document.querySelector('[data-mainbar]'); const shown = Number(bar.dataset.tbshown);
      return { compact: !!document.querySelector('[data-se-cmds][data-compact]'), shown, more: !!document.querySelector('[data-tb-more]'), overlap, over: g.scrollWidth - g.clientWidth, right: Math.round(g.getBoundingClientRect().right), vw: innerWidth, barRight: Math.round([...bar.children].reduce((m, k) => Math.max(m, k.getBoundingClientRect().right), 0)), barEnd: Math.round(bar.getBoundingClientRect().right) };`);
    let hidden = 0;
    if (lay.more) { await c.click("[data-tb-more]"); await sleep(250); hidden = await q("return document.querySelectorAll('[data-tbm]').length"); const pr = await q("const r = document.querySelector('[data-tb-morepanel]').getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right), innerHeight, innerWidth]"); check(`${w} × ${h} เมนูปุ่มอื่นอยู่ในจอ`, pr[0] >= 0 && pr[1] <= pr[4] && pr[2] >= 0 && pr[3] <= pr[5], pr.join(" ")); const y0 = Math.max(0, pr[0] - 12), x0 = 60; await c.shotRect(`${SHOT}/03-แถวคำสั่ง-${w}-เมนูปุ่มอื่น.png`, x0, y0, Math.min(w, pr[3] + 40) - x0, Math.min(h, pr[1] + 70) - y0); await esc(); }
    check(`${w} × ${h} แถวเหนือตารางไม่มีปุ่มซ้อน ไม่ล้น ปุ่มในแถบไม่เลยขอบแถบ`, lay.overlap === 0 && lay.over <= 0 && lay.right <= lay.vw && lay.barRight <= lay.barEnd + 1, JSON.stringify(lay));
    check(`${w} × ${h} ปุ่มย่อที่เห็น ${lay.shown} กับในเมนู ${hidden} รวมครบ 18`, lay.shown + hidden === 18, `${lay.shown} + ${hidden}${lay.compact ? " (ปุ่มคำสั่งเหลือไอคอน)" : ""}`);
    if (w === 1920) check("1920 × 1032 ปุ่มย่อขึ้นครบ 18 ปุ่ม ปุ่มคำสั่งมีชื่อ", lay.shown === 18 && !lay.more && !lay.compact, JSON.stringify(lay));
    await c.shot(`${SHOT}/04-แถวคำสั่ง-${w}.png`, "[data-se-gridbar]", 6);
  }
  await size(1280, 800);

  // ทุกปุ่มในแถบทำงาน
  const ev0 = await q(`const d = ${S}.get().doc; const e = d.events.find((x) => !x.comment && x.start === 500); ${S}.select([e.id], e.id); return { id: e.id, start: e.start, end: e.end };`);
  await sleep(300);
  await tb("jump");
  check("ข้ามไปยัง เปิดหน้าต่างข้ามไปยังเฟรมหรือเวลา", await waitFor("return !!document.querySelector('[data-vjump-go]')", 3000));
  await esc();
  const z0 = await q("return window.__vidLib.get().zoom");
  await tb("zoomin"); await sleep(250);
  const z1 = await q("return window.__vidLib.get().zoom");
  await tb("zoomout"); await sleep(250);
  const z2 = await q("return window.__vidLib.get().zoom");
  check("ซูมเข้าออกทีละ 12.5% จากพอดีกรอบ", z0 === 0 && z1 > 0 && Math.abs(z1 - z2 - 12.5) < 0.01, `${z0} ${z1} ${z2}`);
  await q("window.__vidLib.setZoom(0); return 1;");
  await q("window.__vidLib.seek(60); return 1;"); await sleep(300);
  await tb("jumpstart"); await sleep(300);
  const fr = await q(`const r = window.__vidLib.rate(); return [window.__vidLib.get().pos, r.frameAt(${ev0.start}, 'start'), r.frameAt(${ev0.end}, 'end')];`);
  await tb("jumpend"); await sleep(300);
  const pe = await q("return window.__vidLib.get().pos");
  check("ภาพไปเฟรมแรกกับเฟรมสุดท้ายของบรรทัด (Ctrl+1 Ctrl+2)", fr[0] === fr[1] && pe === fr[2], `${fr[0]}=${fr[1]} ${pe}=${fr[2]}`);
  await q("window.__vidLib.seek(30); return 1;"); await sleep(300);
  const before = await doc();
  await tb("snapstart"); await sleep(250);
  const snapped = await q(`const e = ${S}.get().doc.events.find((x) => x.id === ${ev0.id}); return [e.start, Math.round(window.__vidLib.rate().timeAt(30, 'start'))];`);
  check("สอดเวลาเริ่มกับภาพ เวลาเริ่มเป็นเฟรมที่เห็น", Math.abs(snapped[0] - snapped[1]) <= 10, snapped.join(" "));
  await q(`${S}.undo(); return 1;`);
  await tb("snapend"); await sleep(250);
  check("สอดเวลาจบกับภาพ แก้เอกสาร", (await doc()) !== before);
  await q(`${S}.undo(); return 1;`);
  await tb("visible"); await sleep(250);
  const vis = await q(`return ${S}.get().sel.length`);
  check("เลือกบรรทัดที่ขึ้นบนภาพ", vis >= 1, vis);
  await q(`${S}.select([${ev0.id}], ${ev0.id}); return 1;`); await sleep(200);
  await tb("snapscene"); await sleep(250);
  const sc = (await doc()) !== before;
  await q(`${S}.undo(); return 1;`);
  await tb("toframe"); await sleep(250);
  const tf = (await doc()) !== before;
  await q(`${S}.undo(); return 1;`);
  check("สอดเวลาไปยังฉาก กับเลื่อนไปยังเฟรมปัจจุบัน แก้เอกสาร เลิกทำแล้วเหมือนเดิม", sc && tf && (await doc()) === before);
  for (const [id, sel, name] of [["styles", "[data-style-mgr]", "จัดการสไตล์"], ["shift", "[data-shift-run]", "เลื่อนเวลา"], ["translate", "[data-translate]", "ตัวช่วยแปล"], ["resample", "[data-resample]", "เปลี่ยนความละเอียด"], ["post", "[data-post]", "ปรับเวลาทั้งไฟล์"]]) {
    await tb(id);
    check(`ปุ่ม${name} เปิดหน้าต่าง`, await waitFor(`return !!document.querySelector('${sel}')`, 3000));
    await esc();
  }
  const tag0 = await q("return document.querySelector('[data-se-gridbar] .seg button[aria-pressed=\"true\"], [data-se-gridbar] .seg .on')?.innerText");
  await tb("tagcycle"); await sleep(150);
  const tag1 = await q("return document.querySelector('[data-se-gridbar] .seg button[aria-pressed=\"true\"], [data-se-gridbar] .seg .on')?.innerText");
  await tb("tagcycle"); await sleep(150); await tb("tagcycle"); await sleep(150);
  const tag3 = await q("return document.querySelector('[data-se-gridbar] .seg button[aria-pressed=\"true\"], [data-se-gridbar] .seg .on')?.innerText");
  check("สลับการแสดงแท็ก วนสามแบบแล้วกลับที่เดิม ปุ่มแท็กในตารางตาม", tag0 !== tag1 && tag3 === tag0, `${tag0} ${tag1} ${tag3}`);

  // หน้าต่างคุณสมบัติสคริปต์
  await tb("props");
  check("คุณสมบัติสคริปต์ เปิดหน้าต่าง", await waitFor("return !!document.querySelector('[data-props]')", 3000));
  await sleep(450); // รอหน้าต่างค่อย ๆ ขึ้นจนทึบ ไม่งั้นภาพเห็นของข้างหลังทะลุ
  // ป้ายช่องทุกป้ายอยู่บรรทัดเดียว (เดิม รายละเอียดการอัปเดต ยาวเกินช่อง 104 จุด ตกบรรทัดแล้วโดนกระจายแบบไทยจนตัวอักษรถ่าง)
  const lbl = await q("return [...document.querySelectorAll('[data-props] .se-prf .se-dlbl')].map((l) => { const s = document.createElement('span'); s.style.whiteSpace = 'nowrap'; s.textContent = l.innerText.trim(); l.appendChild(s); const w = s.getBoundingClientRect().width; s.remove(); return [l.innerText.trim(), Math.round(l.getBoundingClientRect().height), Math.ceil(w), Math.floor(l.clientWidth)]; })");
  check("ป้ายช่องในหน้าต่างคุณสมบัติอยู่บรรทัดเดียวทุกป้าย ข้อความไม่ยาวเกินช่อง", lbl.length >= 8 && lbl.every((x) => x[1] <= 24 && x[2] <= x[3]), JSON.stringify(lbl.filter((x) => x[1] > 24 || x[2] > x[3])));
  await c.shot(`${SHOT}/05-คุณสมบัติสคริปต์.png`, ".dlg", 8);
  const pv = await q("const g = (k) => document.querySelector(`[data-pr=\"${k}\"]`)?.value; return { title: g('Title'), px: g('PlayResX'), py: g('PlayResY'), ycc: document.querySelector('[data-props] .dd')?.innerText };");
  check("ช่องอ่านค่าจากไฟล์ PlayRes 1280 × 720", pv.px === "1280" && pv.py === "720", JSON.stringify(pv));
  const d0 = await doc();
  await c.click("[data-pr-ok]"); await sleep(250);
  check("กดตกลงโดยไม่แก้ เอกสารเหมือนเดิมทุกไบต์ (ไม่เขียนค่าตั้งต้นลงไฟล์แบบ Aegisub)", (await doc()) === d0);
  await tb("props"); await waitFor("return !!document.querySelector('[data-props]')", 3000);
  await q("const i = document.querySelector('[data-pr=\"Title\"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'ชื่อทดสอบชุด113'); i.dispatchEvent(new Event('input', { bubbles: true })); return 1;");
  await c.click('[data-pr-video="ycc"]');
  await waitFor("return /TV\\.|PC\\.|None/.test(document.querySelector('[data-props] .dd')?.innerText ?? '')", 8000);
  const ycc = await q("return document.querySelector('[data-props] .dd')?.innerText");
  await c.click("[data-pr-ok]"); await sleep(300);
  const info = await q(`const d = ${S}.get().doc; const L = window.__subStyleLib; return [L.infoGet(d, 'Title'), L.infoGet(d, 'YCbCr Matrix')];`);
  check("แก้หัวเรื่องกับ YCbCr จากวิดีโอ เขียนลงหัวไฟล์", info[0] === "ชื่อทดสอบชุด113" && info[1] === ycc && /^(TV|PC)\.(601|709)|None$/.test(ycc ?? ""), `${info.join(" ")} ปุ่ม ${ycc}`);
  await q(`${S}.undo(); return 1;`);
  check("เลิกทำครั้งเดียว คืนทั้งหน้าต่าง", (await doc()) === d0);
  // ช่องที่ไฟล์ไม่มี ใส่แล้วลบต้องได้หัวไฟล์เดิม · ช่องที่มีอยู่ (หัวเรื่อง) ใส่ค่าว่างแล้วบรรทัดหายไป
  const put = await q("const L = window.__subStyleLib; const d = window.__subEdit.get().doc; const k = 'Update Details'; const a = L.infoPut(d, k, 'x'); const b = L.infoPut(a, k, ''); const t = L.infoPut(d, 'Title', ''); return [L.infoGet(d, k), L.infoGet(a, k), L.infoGet(b, k), JSON.stringify(b.skeleton) === JSON.stringify(d.skeleton), L.infoGet(d, 'Title') !== null, L.infoGet(t, 'Title'), d.skeleton.length - t.skeleton.length];");
  check("infoPut ค่าว่างลบบรรทัดแบบ SetScriptInfo ช่องใหม่ใส่แล้วลบได้หัวไฟล์เดิม ช่องเดิมลบได้", put[0] === null && put[1] === "x" && put[2] === null && put[3] === true && put[4] && put[5] === null && put[6] === 1, JSON.stringify(put));

  // ปุ่มตั้งค่า พาไปหน้าตั้งค่า แล้วกลับมาหน้าแก้ซับ เอกสารยังเปิดอยู่
  await tb("options");
  check("ปุ่มตั้งค่า พาไปหน้าตั้งค่า", await waitFor("return getComputedStyle(document.querySelector('[data-pageslot=settings]')).display !== 'none'", 5000));
  await nav("ซับไตเติล"); await sleep(500);
  check("กลับหน้าแก้ซับ เอกสารเดิมยังเปิดอยู่", await q("return !!document.querySelector('[data-se-gridbar]') && !!window.__subEdit.get().doc"));

  // แถบเลื่อนเวลา
  const sl = await q("const s = document.querySelector('[data-vslider]'), b = document.querySelector('[data-vbar]'); const r = s.getBoundingClientRect(), rb = b.getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width, bw: rb.width, max: Number(s.getAttribute('aria-valuemax')), keys: s.querySelectorAll('.se-vskey').length, kl: window.__vidLib.keys().list.length };");
  check("แถบเลื่อนกว้างเท่าแถบใต้ภาพ ขีด keyframe ครบ", Math.abs(sl.w - sl.bw) <= 1 && sl.keys === sl.kl && sl.max > 0, JSON.stringify(sl));
  const at = (f) => sl.x + 5 + (f * (sl.w - 10)) / sl.max + 0.5;
  await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at(40), y: sl.y, button: "left", clickCount: 1 });
  await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at(40), y: sl.y, button: "left", clickCount: 1 });
  await sleep(300);
  const p1 = await q("return window.__vidLib.get().pos");
  check("คลิกแถบเลื่อน ภาพไปเฟรมตรงจุดที่คลิก (GetValueAtX)", Math.abs(p1 - 40) <= 1, p1);
  await c.drag(at(40), sl.y, at(90), sl.y, { steps: 6 }); await sleep(300);
  const p2 = await q("return window.__vidLib.get().pos");
  check("ลากแถบเลื่อน ภาพตามไปเฟรมที่ปล่อย", Math.abs(p2 - 90) <= 1, p2);
  const keys = await q("return window.__vidLib.keys().list");
  const target = keys.find((k) => k > 10) ?? keys[0];
  await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x: at(target + 3), y: sl.y, button: "left", clickCount: 1, modifiers: 8 });
  await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: at(target + 3), y: sl.y, button: "left", clickCount: 1, modifiers: 8 });
  await sleep(300);
  check("Shift คลิกเลย keyframe ไปนิดเดียว ดูดกลับไป keyframe ที่ใกล้ที่สุด", (await q("return window.__vidLib.get().pos")) === target, `${await q("return window.__vidLib.get().pos")} ${target}`);
  // ตรรกะ keyframe ที่ใกล้ที่สุด (Aegisub ของจริงดูดไปตัวที่ตรงหรือหลังจุดคลิกเสมอเพราะซอร์สเขียนพลาด ที่นี่ทำตามที่ Aegisub ตั้งใจ)
  const nk = await q("const n = window.__vsLib.nearestKey; const K = [0, 96, 192]; return [n(K, 0), n(K, 10), n(K, 50), n(K, 47), n(K, 48), n(K, 99), n(K, 150), n(K, 300), n([], 7)];");
  check("keyframe ที่ใกล้ที่สุด ก่อนหรือหลังจุดคลิก ห่างเท่ากันเลือกตัวหลัง เลยตัวสุดท้ายได้ตัวสุดท้าย", JSON.stringify(nk) === JSON.stringify([0, 0, 96, 0, 96, 96, 192, 192, 7]), JSON.stringify(nk));
  await q("window.__vidLib.seek(50); return 1;"); await sleep(200);
  await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: at(50), y: sl.y, deltaX: 0, deltaY: 100 }); await sleep(250);
  const w1 = await q("return window.__vidLib.get().pos");
  await c.send("Input.dispatchMouseEvent", { type: "mouseWheel", x: at(50), y: sl.y, deltaX: 0, deltaY: -100 }); await sleep(250);
  const w2 = await q("return window.__vidLib.get().pos");
  check("หมุนล้อบนแถบ ทีละหนึ่งเฟรม", w1 === 51 && w2 === 50, `${w1} ${w2}`);
  await c.shot(`${SHOT}/06-แถบเลื่อนกับปุ่มเล่น.png`, "[data-vbox]", 6);

  // ปุ่มเล่น เล่นเฉพาะบรรทัด หยุด · ความดังของหน้าแก้ซับเงียบอยู่แล้ว
  check("ยังไม่เล่น ปุ่มหยุดกดไม่ได้ บอกเหตุผล", await q("const b = document.querySelector('[data-vstop]'); return b.getAttribute('aria-disabled') === 'true' && b.title === 'ยังไม่ได้เล่นหนัง'"));
  await q(`${S}.select([${ev0.id}], ${ev0.id}); window.__vidLib.seek(100); return 1;`); await sleep(300);
  await c.click("[data-vplayline]");
  check("เล่นเฉพาะบรรทัด เริ่มเล่น", await waitFor("return window.__vidPlay().playing", 8000));
  check("ระหว่างเล่น ปุ่มหยุดกดได้", await q("return document.querySelector('[data-vstop]').getAttribute('aria-disabled') !== 'true'"));
  check("เล่นจนจบบรรทัดแล้วหยุดเอง", await waitFor("return !window.__vidPlay().playing", 15000));
  const endPos = await q(`const r = window.__vidLib.rate(); return [window.__vidLib.get().pos, r.frameAt(${ev0.end}, 'end')];`);
  check("หยุดที่เฟรมสุดท้ายของบรรทัด ไม่เลยไปบรรทัดถัดไป", Math.abs(endPos[0] - endPos[1]) <= 2, endPos.join(" "));
  await c.click("[data-vplay]");
  await waitFor("return window.__vidPlay().playing", 8000);
  await sleep(600);
  await c.click("[data-vstop]");
  check("กดหยุด หยุดเล่น", await waitFor("return !window.__vidPlay().playing", 4000));

  /* ---------------------------------------------------------------- 114 รายการสิ่งที่ MP4 เก็บไม่ได้ */
  const lost = await q(`return window.__subRemuxLib.mp4Lost([
    { kind: 'video', keep: true, lang: 'und' },
    { kind: 'audio', keep: true, lang: 'spa', langIetf: 'es-419', commentary: true },
    { kind: 'subtitle', keep: true, lang: 'chi', langIetf: 'zh-Hant', forced: true, hearingImpaired: true },
    { kind: 'subtitle', keep: false, lang: 'tha', langIetf: 'th-TH', original: true },
    { kind: 'subtitle', keep: true, lang: 'eng', langIetf: 'en' },
  ])`);
  check("MP4 บอกภาษาแบบละเอียด ป้ายพิเศษ ธงซับบังคับ ที่จะหาย เฉพาะแทร็กที่เก็บไว้", lost.length === 4 && lost[0].includes("es-419") && lost[1].includes("ป้ายเสียงบรรยาย") && lost[2].includes("zh-Hant") && lost[3].includes("ธงซับบังคับ") && lost[3].includes("ป้ายซับคนหูหนวก") && !lost.join(" ").includes("th-TH") && !lost.join(" ").includes(" en "), lost.join(" | "));

  /* ---------------------------------------------------------------- 118 ส่งออก PGS */
  await c.click('[data-cmdmenu="tool"]'); await sleep(250);
  await c.click('[data-cmd="pgs"]');
  check("เมนูเครื่องมือ ส่งออกเป็น PGS เปิดหน้าต่าง", await waitFor("return !!document.querySelector('[data-pgs]')", 3000));
  const pg = await q("return { warn: document.querySelector('[data-pgs-warn]')?.innerText ?? '', size: document.querySelector('[data-pgs] .dd')?.innerText, path: document.querySelector('[data-pgs-path]')?.innerText }");
  check("ขนาดภาพตามหนัง ที่เก็บเป็น .sup ข้างหนัง", /ตามหนัง 640 × 360/.test(pg.size ?? "") && pg.path.endsWith(".sup"), JSON.stringify(pg));
  check("เตือนขนาดที่ไม่ใช่ของ Blu-ray (หนังทดสอบ 640 × 360)", pg.warn.includes("ไม่ใช่ขนาดของ Blu-ray"), pg.warn.replace(/\s+/g, " ").slice(0, 160));
  await sleep(450); // รอหน้าต่างขึ้นจนทึบก่อนถ่าย
  await c.shot(`${SHOT}/07-ส่งออก-PGS.png`, ".dlg", 8);
  const sup = `${TMP}/ออก.sup`;
  await q(`window.__pgsTarget = ${JSON.stringify(sup)}; return 1;`);
  await c.click("[data-pgs-browse]"); await sleep(200);
  await c.click("[data-pgs-go]");
  check("ส่งออกเสร็จ ขึ้นจำนวนภาพกับขนาด", await waitFor("return !!document.querySelector('[data-pgs-done]')", 120000), await q("return (document.querySelector('[data-pgs-done]') ?? document.querySelector('[data-pgs-err]'))?.innerText?.replace(/\\s+/g, ' ')"));
  // ไฟล์เล็กกว่า 1 MB บอกเป็น KB ไม่ขึ้น 0 MB · ส่วนที่ลดสีต่อด้วยคำเชื่อม โดย
  const doneT = await q("return document.querySelector('[data-pgs-done]')?.innerText?.replace(/\\s+/g, ' ') ?? ''");
  check("ผลส่งออกบอกขนาดเป็น KB ไม่ขึ้น 0 MB และต่อประโยคด้วยคำเชื่อม", /\d+ ภาพ ขนาด [\d,]+ KB/.test(doneT) && !/ 0 MB/.test(doneT) && (!/ลดสี/.test(doneT) || / โดยลดสี/.test(doneT)), doneT);
  const pr = existsSync(sup) ? execFileSync(FP, ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "csv=p=0", sup]).toString().trim() : "";
  check("ffprobe อ่านไฟล์ .sup ได้ เป็น PGS ขนาด 640 × 360", pr.startsWith("hdmv_pgs_subtitle"), pr);
  await c.shot(`${SHOT}/08-ส่งออก-PGS-เสร็จ.png`, ".dlg", 8);
  await c.click("[data-pgs-go]");
  check("ส่งออกชื่อเดิมซ้ำ ไม่เขียนทับ ถามตั้งชื่อใหม่", await waitFor("return !!document.querySelector('[data-pgs-exists]')", 30000));
  await c.click("[data-pgs-renum]");
  check("ตั้งชื่อใหม่ต่อเลขแล้วส่งออกได้", await waitFor("return !!document.querySelector('[data-pgs-done]')", 120000) && readdirSync(TMP).filter((f) => f.endsWith(".sup")).length === 2, readdirSync(TMP).filter((f) => f.endsWith(".sup")).join(" "));
  await esc();
  await q("delete window.__pgsTarget; return 1;");

  /* ---------------------------------------------------------------- 115 เวลาเฟรมแรกของภาพ */
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(LATE)}); return 1;`);
  await waitFor("return / - \\d+$/.test(document.querySelector('[data-vpos]')?.innerText ?? '')", 25000);
  await sleep(500);
  const zero = await q("return window.__audSrc?.zero");
  // -itsoffset 0.3 ที่ 25 เฟรมต่อวินาที ไฟล์เก็บเฟรมแรกที่ 0.32 (ปัดไปขอบเฟรม) เทียบกับเวลาที่ ffprobe อ่านจากไฟล์
  const vStart = Number(String(execFileSync(FP, ["-v", "error", "-select_streams", "v", "-show_entries", "stream=start_time", "-of", "csv=p=0", LATE])).trim());
  check("หนังที่ภาพเริ่มช้า แหล่งเสียงได้เวลาเฟรมแรกของภาพตรงไฟล์ (เสียงเลื่อนตามภาพแบบ Aegisub)", vStart > 0.25 && Math.abs((zero ?? -1) - vStart) < 0.002, `${zero} ไฟล์ ${vStart}`);
  await q("window.__subClear(); return 1;");

  /* ---------------------------------------------------------------- 119 หน้าบิตเรตไฟล์ FLAC */
  await nav("บิตเรต"); await sleep(500);
  await q("window.__bitrateView('new'); return 1;"); await sleep(400);
  await q(`window.__brnOpen(${JSON.stringify(`${TMP}/เพลง 96k.flac`)}); return 1;`);
  await waitFor("return /เฉลี่ย \\d/.test(document.querySelector('.brn-side')?.innerText ?? '') && !document.querySelector('[data-brnprog]')", 60000);
  const br = await q("return { ceil: document.querySelector('[data-brn-ceil]')?.dataset.brnCeil, text: document.querySelector('[data-brn-ceil]')?.innerText, pct: document.querySelector('[data-brn-rawpct]')?.innerText, btn: !!document.querySelector('[data-brn-graph]') }");
  check("FLAC 96 kHz 24 บิต สองช่อง เพดานเป็นเสียงดิบ 4,608 kbps", br.ceil === "raw" && /4[.,]6/.test(br.text ?? ""), JSON.stringify(br));
  check("บอกบีบเหลือกี่เปอร์เซ็นต์ของเสียงดิบ มีปุ่มดูกราฟเสียง", /^\d+%/.test(br.pct ?? "") && br.btn, JSON.stringify(br));
  await c.shot(`${SHOT}/09-บิตเรตเสียงดิบ.png`, ".brn-side", 6);
  await c.click("[data-brn-graph]");
  check("ปุ่มดูกราฟเสียง ไปหน้ากราฟเสียงกับไฟล์เดียวกัน", await waitFor("return getComputedStyle(document.querySelector('[data-pageslot=graph]')).display !== 'none' && (document.body.innerText.includes('เพลง 96k.flac'))", 15000));

  /* ---------------------------------------------------------------- 120 121 แปลงเสียง */
  // หน้ากราฟเปิดไฟล์อยู่ ปุ่มสลับโหมดไม่แสดง ใช้ปุ่มแปลงเสียงบนหัวกราฟ (ใส่ไฟล์นี้เข้าคิวแล้วไปโหมดแปลง)
  await waitFor("return !!document.querySelector('[data-graphconvert], [data-gmode]')", 15000);
  await c.click(await q("return document.querySelector('[data-graphconvert]') ? '[data-graphconvert]' : '[data-gmode=\"convert\"]'"));
  await waitFor("return !!document.querySelector('[data-convert]')", 5000);
  await sleep(1200);
  const drop = (paths) => c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: ${JSON.stringify(paths)}, position: { x: 700, y: 400 } } })`);
  await q("[...document.querySelectorAll('[data-qrow] [data-qremove]')].forEach((b) => b.click()); return 1;");
  await drop([`${TMP}/เพลง 96k.flac`, `${TMP}/เพลง.mp3`]);
  await waitFor("return document.querySelectorAll('[data-qrow]').length === 2 && ![...document.querySelectorAll('[data-qwait]')].some((x) => x.innerText === 'กำลังอ่านไฟล์')", 30000);
  await c.click('[data-qrow="เพลง.mp3"] [data-qto]');
  await waitFor("return !!document.querySelector('[data-codec-panel]')", 10000);
  await q("[...document.querySelectorAll('[data-codec-panel] .seg button')].find((b) => b.innerText.trim() === 'FLAC')?.click(); return 1;");
  await waitFor("return document.querySelector('[data-cmpsum]')?.dataset.cmpsrc === 'probe'", 20000);
  const mp3 = await q("return { warn: [...document.querySelectorAll('[data-codec-panel] .stat.warn')].map((x) => x.innerText).join(' '), sum: document.querySelector('[data-cmpsum]')?.innerText }");
  check("MP3 เป็น FLAC คำเตือนบอกใหญ่ขึ้นกี่เท่า แต่คุณภาพไม่ดีขึ้น", /ใหญ่ขึ้นราว \d+ เท่า แต่คุณภาพเสียงไม่ดีขึ้น/.test(mp3.warn), mp3.warn.replace(/\s+/g, " ").slice(0, 140));
  // การ์ดชุดค่าที่เลือกต้องขึ้นขนาดเท่าหัวแผง (เดิมการ์ดใช้สูตร 4.01 MB หัวแผงใช้ผลลองแปลง 3.79 MB ค่าตั้งเดียวกันได้สองตัวเลข)
  // ขนาดที่คาดของแทร็กนี้กับการ์ดเป็นขนาดเสียงล้วนทั้งคู่ (ตารางเทียบด้านบนรวมรูปปก) ต่างกันได้แค่การปัดเศษ
  const cardSz = await q("const on = document.querySelector('[data-codec-panel] [data-preset].on'); const head = document.querySelector('[data-headsz] b')?.innerText ?? ''; const card = [...(on?.querySelectorAll('.small') ?? [])].map((x) => x.innerText).find((t) => /ทั้งแทร็กราว/.test(t)) ?? ''; const num = (t) => { const m = /([\\d.,]+)\\s*(KB|MB)/.exec(t); return m ? Number(m[1].replace(/,/g, '')) * (m[2] === 'MB' ? 1024 : 1) : 0; }; return [head, card, num(head), num(card)];");
  check("การ์ดชุดค่าที่เลือกขึ้นขนาดเท่าหัวแผง ไม่ขึ้นสองตัวเลขสำหรับค่าตั้งเดียวกัน", cardSz[2] > 0 && Math.abs(cardSz[2] - cardSz[3]) / cardSz[2] <= 0.005, JSON.stringify(cardSz.slice(0, 2)));
  await c.shot(`${SHOT}/10-แผงแปลงเสียง-MP3-เป็น-FLAC.png`, "[data-codec-panel]", 6);
  await esc();
  await c.click('[data-qrow="เพลง 96k.flac"] [data-qto]');
  await waitFor("return !!document.querySelector('[data-codec-panel]')", 10000);
  await q("[...document.querySelectorAll('[data-codec-panel] .seg button')].find((b) => b.innerText.trim() === 'FLAC')?.click(); return 1;");
  check("แผงตั้งค่าเสียง ลองแปลงจริงเสร็จ ป้ายขนาดใช้ผลลองแปลง", await waitFor("return document.querySelector('[data-cmpsum]')?.dataset.cmpsrc === 'probe'", 20000));
  const est = await q("return document.querySelector('[data-cmpb=\"ขนาด\"]')?.innerText");
  await c.shot(`${SHOT}/11-แผงแปลงเสียง-ลองแปลงจริง.png`, ".cpcmp", 6);
  await c.click("[data-conv-use]"); await sleep(300);
  // แปลงเฉพาะไฟล์ FLAC ไฟล์ใหม่อยู่ข้างไฟล์เดิมซึ่งอยู่ในโฟลเดอร์ทดสอบ (ปุ่มเลือกโฟลเดอร์เปิดกล่องของ Windows ไม่ใช้)
  await q("document.querySelector('[data-qrow=\"เพลง.mp3\"] [data-qremove]')?.click(); return 1;"); await sleep(200);
  await c.click("[data-qstart]");
  check("แปลง FLAC เป็น FLAC เสร็จ", await waitFor("return document.querySelector('[data-qrow=\"เพลง 96k.flac\"]')?.dataset.qstate === 'done'", 120000));
  const same = await q("return document.querySelector('[data-qsame]')?.dataset.qsame + ' ' + (document.querySelector('[data-qsame]')?.innerText ?? '')");
  check("แปลงเสร็จติ๊กเขียว เสียงเหมือนต้นฉบับทุกบิต (MD5 ของเสียงตรงกัน)", same.startsWith("yes") && same.includes("เสียงเหมือนต้นฉบับทุกบิต"), same);
  const outs = readdirSync(TMP).filter((f) => /^เพลง 96k.*\.flac$/.test(f) && f !== "เพลง 96k.flac");
  const real = outs.length ? statSync(`${TMP}/${outs[0]}`).size : 0;
  const estB = (() => { const m = /([\d.]+)\s*(KB|MB)/i.exec(est ?? ""); return m ? Number(m[1]) * (m[2].toUpperCase() === "MB" ? 1048576 : 1024) : 0; })();
  check("ขนาดที่คาดใกล้ขนาดจริงของไฟล์ที่แปลง ไม่เกิน 5% (เพลงสั้นกว่า 1 นาที แปลงทั้งเพลง)", real > 0 && Math.abs(estB - real) / real < 0.05, `คาด ${est} จริง ${(real / 1048576).toFixed(2)} MB`);
  await c.shot(`${SHOT}/12-แปลงเสร็จติ๊กเขียว.png`, '[data-qrow="เพลง 96k.flac"]', 6);
} finally {
  try { await q(`try { if (${JSON.stringify(keep[0])} !== null) localStorage.setItem('se-vzoom', ${JSON.stringify(keep[0])}); if (${JSON.stringify(keep[1])} !== null) localStorage.setItem('se-vauto', ${JSON.stringify(keep[1])}); } catch {} window.__subClear?.(); return 1;`); } catch { /* หน้าโหลดใหม่อยู่ */ }
  await c.send("Emulation.clearDeviceMetricsOverride", {});
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(1500);
  c.close();
  rmSync(TMP, { recursive: true, force: true });
}
const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass}/${results.length}`);
process.exit(pass === results.length ? 0 : 1);
