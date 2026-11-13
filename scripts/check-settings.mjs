// ชุด 11 ของ BUGS.md หน้าตั้งค่า ชั้นวาง กับหน้าเสียงและซับ · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-settings.mjs
// ข้อ 7 ปุ่มกลับค่าตั้งต้น · 88 ความจุไดรฟ์ ไดรฟ์เต็ม เตือนชั้นวาง เตือนการ์ดเก็บรูป · 91 ปุ่มเสียงหลักวงกลมกับ ⓘ · 92 ที่เก็บไฟล์แยก · 93 การ์ดวิธีจาง
// AUDIT 33 จำนวนเรื่องใต้โฟลเดอร์ · 135 แถบแดงที่เดียว · 136 ค่ารูปกราฟไม่เด้งกลับ · 137 ไม่ชี้ไฟล์ docs · 155 ช่องที่ปิดอยู่บอกเหตุผล
// ไดรฟ์ใกล้เต็มกับไดรฟ์เต็มใช้ทางลัดรุ่นทดสอบ (__driveSample __settingsFail) เพราะทำของจริงไม่ได้ · คืนค่ารูปกราฟกับแบบส่วนตั้งค่าแทร็กเดิมตอนจบ
import { mkdirSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-13/ชุด11";
mkdirSync(OUT, { recursive: true });
const MOVIE = "D:/movie-shelf/test-media/สร้าง/หนัง/ดาวเหนือ (2023).mkv";
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})});`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click();`);
const toasts = () => q("return [...document.querySelectorAll('.toast')].map((t) => t.innerText.replace(/\\s+/g, ' ').trim());");
const closeToasts = () => q("document.querySelectorAll('.toast button').forEach((b) => b.click());");
const reset = () => q("return document.querySelector('[data-img-reset]')?.getAttribute('data-img-reset');");

await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
const before = (await inv("get_settings")).settings;
const tpBefore = await q("return localStorage.getItem('ms.trackPanel');");
try {
  // ---------- AUDIT 33 · BUGS 88 หัวข้อโฟลเดอร์หนัง ----------
  await nav("ตั้งค่า"); await sleep(400);
  await c.setNav("folders");
  await waitFor("return !!document.querySelector('[data-drive]');");
  const counts = await q("return [...document.querySelectorAll('[data-folder-count]')].map((x) => x.innerText.trim());");
  const lib = await inv("get_library");
  check("ใต้ทุกโฟลเดอร์บอกจำนวนเรื่องตามชั้นวาง ไม่ขึ้น 0 เรื่องลอย ๆ (AUDIT 33)", counts.length > 0 && counts.every((t) => /^\d+ เรื่อง$/.test(t) || t.startsWith("หา")) && !(lib.movies.length > 0 && counts.every((t) => t === "0 เรื่อง")), JSON.stringify(counts));
  const drives = await q("return [...document.querySelectorAll('[data-drive]')].map((d) => ({ root: d.getAttribute('data-drive'), t: d.innerText.replace(/\\s+/g, ' '), bar: Math.round(d.querySelector('.drivebar > i').getBoundingClientRect().width), full: Math.round(d.querySelector('.drivebar').getBoundingClientRect().width) }));");
  check("ความจุไดรฟ์ขึ้นทุกไดรฟ์ที่โฟลเดอร์หนังอยู่ พร้อมไดรฟ์ของโปรแกรม (BUGS 88 ②)", drives.length >= 1 && drives.some((d) => d.t.includes("เก็บค่าตั้ง")) && drives.every((d) => /ว่าง .+ จาก .+/.test(d.t) && d.bar > 0 && d.bar <= d.full), JSON.stringify(drives));
  await c.shot(`${OUT}/01-ความจุไดรฟ์.png`, '[data-setcard="folders"]');
  // ไดรฟ์ใกล้เต็มจำลอง
  await q("window.__driveSample = [{ root: 'C:\\\\', total: 256e9, free: 9e9, folders: [], app: true }, { root: 'D:\\\\', total: 1e12, free: 400e9, folders: ['D:\\\\หนัง'], app: false }]; window.__driveReload();");
  check("ไดรฟ์เหลือไม่ถึง 10% ขึ้นป้ายเตือนบอกเปอร์เซ็นต์ที่เหลือ แถบเป็นสีเตือน", await waitFor("return document.querySelector('[data-drive=\"C:\\\\\\\\\"]')?.classList.contains('low') && document.querySelector('[data-drive-low]')?.innerText.trim() === 'เหลือ 3.5%';"));
  check("ไดรฟ์ที่ที่ว่างพอบอกเปอร์เซ็นต์ที่เหลือ", (await q("return document.querySelector('[data-drive-pct]')?.innerText;")) === "40%", await q("return document.querySelector('[data-drive-pct]')?.innerText;"));
  await c.shot(`${OUT}/02-ไดรฟ์ใกล้เต็ม-หน้าตั้งค่า.png`, '[data-drives]');

  // ---------- BUGS 88 ④ การ์ดเก็บรูปที่จับคู่ ----------
  await c.setNav("link");
  const app = await q("return document.querySelector('[data-link-mode=app]')?.getAttribute('aria-checked');");
  if (app !== "true") { await c.click("[data-link-mode=app]"); await sleep(500); }
  check("ติ๊กเก็บสำเนาไว้ในโปรแกรม ไดรฟ์ของโปรแกรมใกล้เต็ม เตือนในการ์ดนั้น (BUGS 88 ④)", await waitFor("return !!document.querySelector('[data-link-mode=app] [data-link-app-low]');"));
  await c.shot(`${OUT}/03-เตือนในการ์ดเก็บสำเนาในโปรแกรม.png`, "[data-link-mode=app]");
  if (app !== "true") { await c.click("[data-link-mode=app]"); await sleep(500); }

  // ---------- BUGS 88 ③ ชั้นวาง ----------
  await nav("ชั้นวางหนัง");
  check("ชั้นวางขึ้นคำเตือนไดรฟ์ใกล้เต็ม (BUGS 88 ③)", await waitFor("return !!document.querySelector('[data-drive-low-shelf]');"));
  await c.shot(`${OUT}/04-เตือนที่ชั้นวาง.png`, "[data-drive-low-shelf]");
  await c.click("[data-drive-low-go]");
  check("กดดูความจุไดรฟ์ ไปหน้าตั้งค่าหัวข้อโฟลเดอร์หนัง", await waitFor("return !document.querySelector('[data-setcard=folders]')?.hidden && !!document.querySelector('[data-setcard=folders]')?.offsetParent;"));
  await nav("ชั้นวางหนัง"); await sleep(300);
  // ปุ่มที่สาม เปิดไดรฟ์ (พี่กันสั่ง "เพิ่มปุ่มที่สาม") · ตั้ง __openDry ไม่ให้ Explorer เด้งขึ้นจอ
  const btns = await q("return [...document.querySelectorAll('[data-drive-low-shelf] .minirow button')].map((b) => b.innerText.trim());");
  check("คำเตือนที่ชั้นวางมีสามปุ่ม ดูความจุไดรฟ์ เปิดไดรฟ์ C ไว้ทีหลัง", JSON.stringify(btns) === JSON.stringify(["ดูความจุไดรฟ์", "เปิดไดรฟ์\u00a0C", "ไว้ทีหลัง"]), JSON.stringify(btns));
  await q("window.__openDry = true; window.__openDryLog = [];");
  await c.click('[data-drive-low-open]');
  check("กดเปิดไดรฟ์ C ส่งรากไดรฟ์ C ไปเปิด", JSON.stringify(await q("return window.__openDryLog;")) === JSON.stringify(["C:\\"]), JSON.stringify(await q("return window.__openDryLog;")));
  await q("delete window.__openDry;");
  const deny = await q("try { await window.__TAURI_INTERNALS__.invoke('drive_open', { root: 'Q:\\\\' }); return 'เปิดได้'; } catch (e) { return String(e); }");
  check("ฝั่ง Rust ไม่เปิดไดรฟ์ที่ไม่อยู่ในรายการความจุ", deny.includes("ไม่ได้อยู่ในรายการ"), deny);
  const sb0 = await q("return Math.round(document.querySelector('[data-statusbar]').getBoundingClientRect().height);");
  await c.click("[data-drive-low-later]");
  check("กดไว้ทีหลัง คำเตือนหาย", await waitFor("return !document.querySelector('[data-drive-low-shelf]');"));
  // ป้ายจางที่แถบล่าง (พี่กันเสนอ "เตือนจางๆข้างล่างดีมั้ย")
  const chip = await q("const b = document.querySelector('[data-drive-low-chip]'); const bar = document.querySelector('[data-statusbar]'); return b ? { t: b.innerText.trim(), h: Math.round(bar.getBoundingClientRect().height), inBar: bar.contains(b), title: b.title } : null;");
  check("กดไว้ทีหลังแล้ว แถบล่างขึ้นป้ายจาง ๆ ไดรฟ์ C เหลือ 3.5% แถบไม่สูงขึ้น", chip?.t === "ไดรฟ์\u00a0C เหลือ 3.5%" && chip.inBar && chip.h === sb0 && chip.title.includes("ว่าง"), JSON.stringify({ ...chip, sb0 }));
  await c.shot(`${OUT}/04b-ป้ายจางที่แถบล่าง.png`, "[data-statusbar]");
  await c.click("[data-drive-low-chip]");
  check("กดป้ายแล้วการ์ดเตือนกลับมา ป้ายหาย", await waitFor("return !!document.querySelector('[data-drive-low-shelf]') && !document.querySelector('[data-drive-low-chip]');"));
  await q("delete window.__driveSample; window.__driveReload();");
  // เลิกค่าจำลองแล้ว คำเตือนต้องเป็นค่าจริงของเครื่อง · เครื่องนี้ไดรฟ์ C เหลือราว 2 GB จึงยังเตือน แต่ตัวเลขต้องไม่ใช่ 8.38 GB ของค่าจำลอง
  await sleep(800);
  const real = await q("const s = document.querySelector('[data-drive-low-shelf]'); return s ? s.innerText.replace(/\\s+/g, ' ') : '';");
  const lib2 = await inv("drive_space", { folders: (await inv("get_settings")).settings.folders });
  const realLow = lib2.some((d) => d.total > 0 && d.free / d.total < 0.1);
  check("เลิกค่าจำลองแล้ว คำเตือนตามค่าจริงของเครื่อง", realLow ? real.includes("ไดรฟ์") && !real.includes("8.38 GB") : real === "", realLow ? real.slice(0, 80) : "ไม่มีไดรฟ์ใกล้เต็ม คำเตือนหาย");

  // ---------- BUGS 88 ① AUDIT 135 ไดรฟ์เต็ม แถบแดงที่เดียว ----------
  await nav("ตั้งค่า"); await sleep(300);
  await c.setNav("graph");
  await closeToasts(); await sleep(300);
  await q("window.__settingsFail = 'DISK_FULL:C';");
  await c.click('[data-img-row="gray"] .seg button:not(.on)');
  await sleep(600);
  const t1 = await toasts();
  check("บันทึกไม่สำเร็จเพราะไดรฟ์เต็ม บอกว่าไดรฟ์ C เต็ม แถบแดงแถบเดียว (BUGS 88 ① AUDIT 135)", t1.length === 1 && t1[0].includes("ไดรฟ์ C เต็ม"), JSON.stringify(t1));
  await c.shot(`${OUT}/05-ไดรฟ์เต็ม-แถบแจ้ง.png`, ".toast");
  await q("delete window.__settingsFail;");
  await closeToasts(); await sleep(300);

  // ---------- BUGS 7 ปุ่มกลับค่าตั้งต้น ----------
  await inv("set_settings", { patch: { graphImg: { ...before.graphImg, format: "jpg", quality: 80 } } });
  await q("location.reload();"); await sleep(2500);
  await waitFor("return !!document.querySelector('.side .nav');", 30000);
  await nav("ตั้งค่า"); await sleep(300); await c.setNav("graph");
  check("มีค่าที่ปรับไว้ ปุ่มกลับค่าตั้งต้นกดได้", await reset() === "ready");
  const w0 = await q("return Math.round(document.querySelector('[data-img-reset]').getBoundingClientRect().width);");
  await c.shot(`${OUT}/06-ปุ่มกลับค่า-กดได้.png`, "[data-img-reset]", 12);
  await c.click("[data-img-reset]");
  check("กดแล้วขึ้นกลับค่าแล้ว พร้อมติ๊กถูก", await waitFor("return document.querySelector('[data-img-reset]')?.getAttribute('data-img-reset') === 'done';", 3000));
  await sleep(250);
  await c.shot(`${OUT}/07-ปุ่มกลับค่า-กลับแล้ว.png`, "[data-img-reset]", 12);
  check("ค่ารูปกราฟกลับเป็นค่าตั้งต้นจริงในไฟล์ตั้งค่า", (await inv("get_settings")).settings.graphImg.format === "png");
  check("ผ่านไปครู่หนึ่ง ปุ่มจางกดไม่ได้ ข้อความบอกว่าเป็นค่าตั้งต้นแล้ว", await waitFor("const b = document.querySelector('[data-img-reset]'); return b?.getAttribute('data-img-reset') === 'idle' && b.getAttribute('aria-disabled') === 'true' && b.innerText.includes('เป็นค่าตั้งต้นแล้ว');", 4000));
  const w1 = await q("return Math.round(document.querySelector('[data-img-reset]').getBoundingClientRect().width);");
  check("ความกว้างปุ่มเท่ากันทุกสถานะ", w0 === w1, `${w0} ${w1}`);
  await c.shot(`${OUT}/08-ปุ่มกลับค่า-จาง.png`, "[data-img-reset]", 12);

  // ---------- AUDIT 155 ช่องที่ปิดอยู่ ----------
  const off = await q("const b = document.querySelector('[data-img-row=quality] .imgslidebox'); const n = document.querySelector('[data-img-row=quality] .imgnum'); return { cls: b.className, title: b.title, cur: getComputedStyle(b).cursor, pe: getComputedStyle(b).pointerEvents, ntitle: n.title };");
  check("PNG ช่องคุณภาพจาง ชี้แล้วมีเหตุผล เคอร์เซอร์บอกว่ากดไม่ได้ ไม่ตัดการรับเมาส์ (AUDIT 155)", off.cls.includes("off") && off.title.includes("JPG") && off.ntitle.includes("JPG") && off.cur === "not-allowed" && off.pe !== "none", JSON.stringify(off));
  const q0 = (await inv("get_settings")).settings.graphImg.quality;
  await c.click("[data-img-row=quality] .imgslidebox .range");
  await sleep(500);
  check("กดแถบคุณภาพที่ปิดอยู่ ค่าไม่เปลี่ยน", (await inv("get_settings")).settings.graphImg.quality === q0);

  // ---------- AUDIT 136 ค่าที่กดก่อนไม่เด้งกลับ ----------
  const wBefore = (await inv("get_settings")).settings.graphImg.width;
  await c.click("[data-img-slide-width] .range");
  await c.key("ArrowRight");
  await c.click('[data-img-row="format"] .seg button:nth-child(2)'); // JPG ภายใน 0.25 วินาทีหลังขยับแถบ
  await sleep(1200);
  const g = (await inv("get_settings")).settings.graphImg;
  check("ขยับแถบความกว้างแล้วรีบกด JPG ชนิดไฟล์เป็น JPG และความกว้างใหม่ไม่หาย (AUDIT 136)", g.format === "jpg" && g.width !== wBefore, `ชนิด ${g.format} กว้าง ${wBefore}→${g.width}`);
  check("ปุ่มกลับค่ากดได้อีกครั้งเมื่อมีค่าที่ปรับ", await reset() === "ready");

  // ---------- AUDIT 137 ----------
  await c.setNav("encoders").catch(() => null);
  const enc = await q("return document.body.innerText.includes('docs/research') ? 'ยังมี' : (document.querySelector('[data-enc-thanks]') ? 'ok' : 'ไม่เจอปุ่ม');");
  check("หัวข้อตัวแปลงเสียงไม่ชี้ไฟล์ docs แล้ว มีปุ่มไปหัวข้อขอบคุณ (AUDIT 137)", enc === "ok", enc);

  // ---------- BUGS 91 92 93 หน้าเสียงและซับ ----------
  await nav("เสียงและซับ"); await sleep(500);
  await q(`window.__avDrop([${JSON.stringify(MOVIE)}], 400, 300)`);
  await waitFor("return document.querySelectorAll('[data-pageslot=av] [data-trk]').length > 2;", 20000);
  await sleep(500);
  // ไม่จางทั้งใบ (จางทั้งใบดูเหมือนกดไม่ได้ พี่กันเคาะ "เอาตามเธอละกัน") · ไอคอนหม่น ตัวหนังสือสีอ่อนลง ทั้งการ์ดยังทึบ
  const cards = await q("return [...document.querySelectorAll('[data-pageslot=av] .avm-card')].map((b) => ({ on: b.classList.contains('on'), op: getComputedStyle(b).opacity, ic: getComputedStyle(b.querySelector('.avm-ic')).filter, col: getComputedStyle(b).color }));");
  check("การ์ดวิธีที่ไม่ได้เลือกหม่นลงแต่ไม่จางทั้งใบ ที่เลือกชัด (BUGS 93)", cards.length === 3 && cards.every((x) => x.op === "1" && (x.on ? x.ic === "none" : x.ic.includes("saturate"))), JSON.stringify(cards));
  const p = await c.hover('[data-pageslot=av] .avm-card[data-mode="pair"]'); await sleep(300);
  const hv = await q("const b = document.querySelector('[data-pageslot=av] .avm-card[data-mode=pair]'); return { ic: getComputedStyle(b.querySelector('.avm-ic')).filter, cur: getComputedStyle(b).cursor };");
  check("ชี้การ์ดที่ไม่ได้เลือก กลับเป็นสีเต็ม เคอร์เซอร์รูปมือ", hv.ic === "none" && hv.cur === "pointer", JSON.stringify(hv));
  await c.shot(`${OUT}/09b-การ์ดวิธี-ชี้.png`, "[data-pageslot=av] .avm-row");
  await c.move(5, 5); await sleep(300); void p;
  await c.shot(`${OUT}/09-การ์ดวิธี.png`, "[data-pageslot=av] .avm-row");
  await q("window.__setTrackPanel('under', false);"); await sleep(200);
  await q("document.querySelectorAll('[data-pageslot=av] [data-trk][data-kind=audio]')[0].click();"); await sleep(800);
  const main = await q("const p = document.querySelector('[data-pageslot=av] [data-main-panel]'); return p ? { radio: !!p.querySelector('.radio'), box: !!p.querySelector('.cbx'), role: p.getAttribute('role'), tip: !!p.parentElement.querySelector('.avlbl button, .avlbl [aria-label]') } : null;");
  check("ส่วนตั้งค่าแทร็กใช้ปุ่มวงกลมแบบคอลัมน์หลัก มีปุ่ม ⓘ (BUGS 91)", main?.radio && !main.box && main.role === "radio" && main.tip, JSON.stringify(main));
  await c.shot(`${OUT}/10-เสียงหลักวงกลม.png`, "[data-pageslot=av] [data-main-panel]", 40);
  await q("document.querySelector('[data-pageslot=av] [data-trk].sel')?.click();"); await sleep(300);
  await c.click('[data-pageslot=av] .avm-card[data-mode="extract"]'); await sleep(600);
  const dest = await q("const d = document.querySelector('[data-pageslot=av] [data-extract-dest]'); const btn = document.querySelector('[data-pageslot=av] [data-extract-start]'); if (!d) return null; const r = d.getBoundingClientRect(), b = btn.getBoundingClientRect(); return { t: d.innerText.replace(/\\s+/g, ' '), title: d.title, h: Math.round(r.height), gap: Math.round(b.left - r.right), sameRow: Math.abs((r.top + r.bottom) / 2 - (b.top + b.bottom) / 2) < 3, fw: getComputedStyle(d.querySelector('b')).fontWeight };");
  check("ที่เก็บไฟล์แยกอยู่ข้างปุ่มแยก บรรทัดเดียว ตัวหนา ชี้แล้วเห็นที่อยู่เต็ม (BUGS 92)", dest && dest.t.startsWith("เก็บที่") && dest.title.length > 5 && dest.sameRow && dest.h <= 36 && Number(dest.fw) >= 700 && dest.gap < 160, JSON.stringify(dest));
  await c.shot(`${OUT}/11-ที่เก็บไฟล์แยก.png`, "[data-pageslot=av] .avxfoot");
  // แถบล่างสูงเท่ากันทุกวิธี สลับวิธีแล้วกล่องที่ตรึงล่างไม่ยืดหด (พี่กันทัก "ก็บอกว่าให้ fix ไง")
  const dockH = () => q("const d = document.querySelector('[data-pageslot=av] .avdock').getBoundingClientRect(); return [Math.round(d.top), Math.round(d.height)];");
  const docks = {};
  for (const m of ["merge", "pair", "extract"]) { await c.click(`[data-pageslot=av] .avm-card[data-mode="${m}"]`); await sleep(400); docks[m] = await dockH(); await c.shot(`${OUT}/12-แถบล่าง-${m}.png`, "[data-pageslot=av] .avdock", 0); }
  await q("document.querySelector('[data-pageslot=av] [data-trk] [role=checkbox], [data-pageslot=av] [data-trk] input[type=checkbox]')?.click();"); await sleep(400);
  docks.extractPicked = await dockH();
  const picked = await q("return document.querySelector('[data-pageslot=av] .xpicks')?.innerText.trim();");
  await q("document.querySelector('[data-pageslot=av] [data-trk] [role=checkbox][aria-checked=true], [data-pageslot=av] [data-trk] input[type=checkbox]:checked')?.click();"); await sleep(300);
  // BUGS 94 ที่ว่างไม่พอ เตือนข้างปุ่มก่อนกด · จำลองไดรฟ์เหลือ 1 MB ด้วย dev_fake_free (free_space ตัวเดียวกับที่งานเช็กตอนเริ่ม)
  await c.click('[data-pageslot=av] .avm-card[data-mode="extract"]'); await sleep(300);
  await q("document.querySelector('[data-pageslot=av] [data-trk] [role=checkbox], [data-pageslot=av] [data-trk] input[type=checkbox]')?.click();"); await sleep(300);
  await inv("dev_fake_free", { bytes: 1024 * 1024 });
  await q("window.dispatchEvent(new Event('focus'));");
  const sp = await waitFor("return /ต้องใช้ราว .+ แต่เหลือ 1.00.MB/.test(document.querySelector('[data-pageslot=av] .xpicks')?.innerText ?? '');", 6000);
  const spInfo = await q("const b = document.querySelector('[data-pageslot=av] [data-extract-start]'); return { hint: document.querySelector('[data-pageslot=av] .xpicks')?.innerText.replace(/\\s+/g, ' '), dis: b.getAttribute('aria-disabled'), dock: Math.round(document.querySelector('[data-pageslot=av] .avdock').getBoundingClientRect().height) };");
  check("ไดรฟ์เหลือไม่พอ การ์ดแยกไฟล์บอกต้องใช้เท่าไหร่ เหลือเท่าไหร่ ปุ่มแยกกดไม่ได้ แถบล่างไม่สูงขึ้น (BUGS 94)", sp && spInfo.dis === "true" && spInfo.dock === docks.merge[1], JSON.stringify(spInfo));
  await c.shot(`${OUT}/13-ที่ว่างไม่พอ-แยกไฟล์.png`, "[data-pageslot=av] .avdock", 0);
  await inv("dev_fake_free", { bytes: 0 });
  await q("window.dispatchEvent(new Event('focus'));"); await sleep(600);
  check("ไดรฟ์มีที่ว่างพอ คำเตือนหาย ปุ่มแยกกดได้", await q("return !/แต่เหลือ/.test(document.querySelector('[data-pageslot=av] .xpicks')?.innerText ?? '') && document.querySelector('[data-pageslot=av] [data-extract-start]').getAttribute('aria-disabled') !== 'true';"));
  await q("document.querySelector('[data-pageslot=av] [data-trk] [role=checkbox][aria-checked=true], [data-pageslot=av] [data-trk] input[type=checkbox]:checked')?.click();"); await sleep(300);
  const hs = Object.values(docks).map((x) => x.join(","));
  check("แถบล่างสูงเท่ากันทุกวิธี ทั้งตอนยังไม่ติ๊กและติ๊กแล้ว ไม่ยืดหดตอนสลับวิธี", new Set(hs).size === 1, JSON.stringify({ ...docks, picked }));
  await c.click('[data-pageslot=av] .avm-card[data-mode="merge"]'); await sleep(300);
} finally {
  await inv("dev_fake_free", { bytes: 0 }).catch(() => null);
  await q("delete window.__driveSample; delete window.__settingsFail; window.__driveReload?.();").catch(() => null);
  await inv("set_settings", { patch: { graphImg: before.graphImg, linkStores: before.linkStores, linkStore: before.linkStore } }).catch(() => null);
  if (tpBefore) await q(`window.__setTrackPanel(${JSON.stringify(tpBefore)}, false);`).catch(() => null);
  await nav("ชั้นวางหนัง").catch(() => null);
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => null);
}
const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass} จาก ${results.length} ข้อ · ภาพอยู่ ${OUT}`);
process.exit(pass === results.length ? 0 : 1);
