// หน้าต่างแปลงซับภาพเป็นซับภาพ (BUGS ข้อ 125 · ImgConvDialog.tsx · imgconv.rs)
// พี่กันสั่ง 15 พ.ย. 2569 "เอามาก็ดีนะ ตอนระบบแปลงจากซับภาพเป็นซับภาพ" แล้ว "ส่วนของ UXUI เอามาจากเจ้านั้นได้นะ แปลงมา เเละเสริมของเราถ้ามีจุดที่อยากเพิ่ม"
// ตรวจ ปุ่มเปิดในตัวดูซับรูปภาพ · ขนาดหน้าต่าง · ที่เก็บตั้งเองไม่ชนไฟล์ · ภาพต้นทางกับภาพที่จะได้ · เปลี่ยนขนาดจอแล้วตำแหน่งตามสัดส่วน · เลื่อนเวลา
//   · VobSub เหลือไม่เกิน 4 สีในภาพตัวอย่าง · แปลงจริงสามชนิด (PGS VobSub BDN XML) อ่านกลับด้วย ffprobe · ไม่เขียนทับ ตั้งชื่อใหม่ต่อเลข
//   · Subtitle Edit ซ่อนตัวเลือกที่ทำไม่ได้ · ไฟล์ที่ BDSup2Sub++ อ่านไม่ได้บอกให้ใช้ Subtitle Edit แล้วกดสลับได้ · ซับรูปในไฟล์ MKV · จำค่าที่ตั้ง ค่าตั้งต้น Esc
//   · แถวตั้งค่าไม่ล้นไม่ซ้อน · จุดตัดบรรทัดของกล่อง ⓘ ทุกกล่อง
// ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-imgconv.mjs · ตอนพี่กันทำงานอยู่ส่ง NOGATE=1 · DUMP=1 พิมพ์จุดตัดบรรทัดของกล่อง ⓘ
// ไม่เปิดกล่องเลือกไฟล์ ใช้ window.__imgTarget · ไม่เปิด Explorer ใช้ window.__openDry · เขียนไฟล์ลง D:\dev\tmp\ชั้นตรวจแปลงซับภาพ แล้วลบตอนจบ
// ภาพลง docs/report-2026-11-15/แปลงซับภาพ/
import { mkdirSync, copyFileSync, rmSync, readdirSync, existsSync, statSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";
import { linesOf } from "./lib/lines.mjs";

const NOGATE = process.env.NOGATE === "1";
const DUMP = process.env.DUMP === "1";
const gate = () => { if (NOGATE) return; try { execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/fg-gate.ps1"], { stdio: "ignore" }); } catch { console.log("หน้าต่างชั้นหนังอยู่หน้าสุดของจอ หยุดตรวจ"); process.exit(2); } };
gate();

const SRC = "D:/movie-shelf/test-media/ซับตัวอย่าง-ffmpeg";
const TMP = "D:/dev/tmp/ชั้นตรวจแปลงซับภาพ";
const SUP = `${TMP}/ซับภาพ PGS.sup`;
const BADIDX = `${TMP}/ซับ VobSub รุ่นเก่า.idx`;
const MKV = `${TMP}/ซับรูป (2024).mkv`;
// ซับภาพของแผ่น HD DVD หัวไฟล์ SP ที่ ffmpeg กับ mkvmerge อ่านไม่ได้ (BUGS ข้อ 129) · ลอกมาไว้ในโฟลเดอร์ทดสอบ ไฟล์ใน test-media ไม่ถูกแตะ
const HDDVD = `${TMP}/ซับ HD DVD.sup`;
const SHOT = "docs/report-2026-11-15/แปลงซับภาพ";
const FP = "D:/movie-shelf/src-tauri/tools/ffprobe.exe";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(SHOT, { recursive: true });
copyFileSync(`${SRC}/pgs_sub.sup`, SUP);
copyFileSync(`${SRC}/vobsub.idx`, BADIDX);
copyFileSync(`${SRC}/vobsub.sub`, BADIDX.replace(/\.idx$/, ".sub"));
copyFileSync("D:/movie-shelf/test-media/สร้าง/เสียงซับ/ซับรูป (2024).mkv", MKV);
copyFileSync(`${SRC}/Subpictures_20.sup`, HDDVD);
// ซับ PGS หลายภาพที่ทั้งสองตัวถอดอ่านได้ · ให้ Subtitle Edit แปลงจาก VobSub ตัวอย่าง (43 ภาพ 720 × 480)
const MULTI = `${TMP}/ซับหลายภาพ.sup`;
execFileSync("D:/movie-shelf/src-tauri/tools/seconv/seconv.exe", [`${SRC}/vobsub.idx`, "bluraysup", `--output-folder:${TMP}`, "--output-filename:ซับหลายภาพ.sup", "--overwrite", "--quiet"], { stdio: "ignore" });

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click(); return 1;`);
const click = async (sel) => { gate(); await c.click(sel); };
const esc = () => c.key("Escape");
const probe = (f) => JSON.parse(execFileSync(FP, ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "json", f]).toString()).streams?.[0] ?? {};

const openSub = async (file) => {
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(file)}); return 1;`);
  return waitFor("return !!document.querySelector('[data-subviewer][data-mode=image] [data-imgconv-open]')", 30000);
};
const openDlg = async () => { await click("[data-imgconv-open]"); return waitFor("return !!document.querySelector('[data-icv]')", 4000); };
const closeDlg = async () => { await q("const b = [...document.querySelectorAll('.dlg .acts .btn-ghost')].find((b) => /ยกเลิก|ปิด/.test(b.innerText)); (b ?? document.querySelector('[data-sv-close]'))?.click(); return 1;"); await sleep(300); };
/** รอภาพตัวอย่างของผลเสร็จ (มีภาพ หรือขึ้นกล่องทำไม่ได้) */
const prevDone = (ms = 60000) => waitFor("return !document.querySelector('[data-icv-wait]') && (!!document.querySelector('[data-icv-frame=out] img') || !!document.querySelector('[data-icv-prev-err]'))", ms);
const seg = (label, text) => q(`const g = [...document.querySelectorAll('[data-icv] .seg')].find((s) => s.getAttribute('aria-label') === ${JSON.stringify(label)}); const b = g && [...g.querySelectorAll('button')].find((x) => x.innerText.trim() === ${JSON.stringify(text)}); if (b) { b.click(); return true; } return false;`);
const sw = (label, on) => q(`const b = document.querySelector('[data-icv] button.switch[aria-label=${JSON.stringify(label)}]'); if (!b) return false; if ((b.getAttribute('aria-checked') === 'true') !== ${on}) b.click(); return true;`);
const dd = async (label, text) => {
  await q(`document.querySelector('[data-icv] button.dd[aria-label^=${JSON.stringify(label + ":")}]')?.click(); return 1;`); await sleep(200);
  return q(`const o = [...document.querySelectorAll('.menu[aria-label=${JSON.stringify(label)}] [role=option]')].find((x) => x.innerText.trim() === ${JSON.stringify(text)}); if (o) { o.click(); return true; } return false;`);
};
const num = (data, v) => q(`const i = document.querySelector('[data-icv] [data-style-num=${JSON.stringify(data)}]'); if (!i) return false; i.focus(); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(String(v))}); i.dispatchEvent(new Event('input', { bubbles: true })); return true;`);
const caps = () => q("return [...document.querySelectorAll('[data-icv-cap]')].map((f) => f.innerText.trim())");
const info = (k) => q(`return document.querySelector('[data-icv-info=${k}]')?.innerText.trim() ?? ''`);
const pathNow = () => q("return document.querySelector('[data-icv-path]')?.getAttribute('title') ?? ''");
/** ภาพ w × h ที่ x, y เวลา m:ss.ss (เกินชั่วโมง h:mm:ss.ss) · คืน { w, h, x, y, t } */
const parseInfo = (s) => { const m = /ภาพ (\d+) × (\d+) ที่ (\d+), (\d+) เวลา (?:(\d+):)?(\d+):(\d\d\.\d\d)/.exec(s); return m ? { w: +m[1], h: +m[2], x: +m[3], y: +m[4], t: (+(m[5] ?? 0)) * 3600 + (+m[6]) * 60 + parseFloat(m[7]) } : null; };
/** จำนวนสีไม่ซ้ำ (รวมโปร่งใส) ในภาพตัวอย่างของผล */
const colors = () => q(`const im = document.querySelector('[data-icv-frame=out] img'); if (!im) return -1; await im.decode(); const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const g = cv.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height).data; const s = new Set(); for (let i = 0; i < d.length; i += 4) s.add(d[i + 3] === 0 ? 'x' : d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ',' + d[i + 3]); return s.size;`);
/** แถวตั้งค่าทุกแถว ของในแถวไม่ล้นแถวและไม่ซ้อนกัน · ป้ายหน้าแถวบรรทัดเดียว · ฝั่งซ้ายไม่ล้นแนวนอน */
const rowsOk = async (what) => {
  const rowBad = await q(`return [...document.querySelectorAll('[data-icv-left] .icv-row')].flatMap((row) => { const rb = row.getBoundingClientRect(); const kids = [...row.children].filter((k) => k.getBoundingClientRect().width > 0).map((k) => k.getBoundingClientRect());
    const out = kids.some((k) => k.right > rb.right + 1 || k.left < rb.left - 1); let ov = false; for (let i = 1; i < kids.length; i++) if (kids[i].left < kids[i - 1].right - 1 && kids[i].top < kids[i - 1].bottom - 1) ov = true; return out || ov ? [row.innerText.replace(/\\s+/g, ' ').slice(0, 30)] : []; });`);
  check(`${what} แถวตั้งค่าทุกแถว ของไม่ล้นแถวและไม่ซ้อนกัน`, rowBad.length === 0, rowBad.join(" | "));
  const lbl = await q("return [...document.querySelectorAll('[data-icv-left] .icv-lbl')].filter((l) => l.getBoundingClientRect().height > 30).map((l) => l.innerText)");
  check(`${what} ป้ายหน้าแถวทุกป้ายอยู่บรรทัดเดียว`, lbl.length === 0, lbl.join(" | "));
  const lx = await q("const l = document.querySelector('[data-icv-left]'); const r = document.querySelector('[data-icv-right]'); return [l.scrollWidth - l.clientWidth, r.scrollWidth - r.clientWidth]");
  check(`${what} ฝั่งตั้งค่าและฝั่งภาพไม่ล้นแนวนอน`, lx[0] <= 0 && lx[1] <= 0, lx.join(" "));
};
const tipLines = async (title) => {
  await q(`document.querySelector('[data-icv] .infob[data-info=${JSON.stringify(title)}]')?.scrollIntoView({ block: 'center' }); return 1;`);
  await sleep(120);
  await click(`[data-icv] .infob[data-info="${title}"]`); await sleep(350);
  const got = await linesOf(q, `.infotip[data-tip="${title}"]`);
  await esc(); await sleep(150);
  return got;
};
// จุดตัดบรรทัดที่คาดไว้ของทุกกล่อง ⓘ ในหน้าต่าง ที่หน้าต่าง 1280 × 800 (อ่านเองทุกบรรทัดแล้ว 15 พ.ย. 2569)
const TIPS = {
  "แปลงซับภาพ": ["แปลงซับภาพ เช่น VobSub ของ DVD เป็น PGS ของ Blu-ray ⏎ และย่อขยายภาพ เปลี่ยนอัตราเฟรม หรือเลื่อนเวลาได้ในรอบเดียว","ซับภาพ ซับที่เก็บเป็นภาพ ไม่ใช่ตัวหนังสือ จึงแก้คำไม่ได้ ⏎ แต่หน้าตาเหมือนกันทุกเครื่องเล่น","ไฟล์เดิม ไม่ถูกแตะ โปรแกรมเขียนเป็นไฟล์ใหม่ ⏎ และไม่เขียนทับไฟล์ที่มีอยู่แล้ว"],
  "ตัวแปลงซับภาพ": ["ตัวแปลงมีให้เลือกสองตัว โดย BDSup2Sub++ ทำได้ครบกว่า","BDSup2Sub++ BDSup2Sub รุ่น C++ ⏎ ซึ่งคนทำแผ่น Blu-ray ใช้กันมานาน ⏎ ข้อดีย่อขยาย เปลี่ยนอัตราเฟรม ย้ายตำแหน่ง และตั้งจานสีได้ ⏎ ข้อเสียอ่านไฟล์บางไฟล์ไม่ได้ ⏎ เช่น VobSub ที่ทำด้วยโปรแกรมรุ่นเก่า","Subtitle Edit ตัวแปลง SeConv ของ Subtitle Edit ⏎ ข้อดีอ่านไฟล์ที่ BDSup2Sub++ อ่านไม่ได้ ⏎ ข้อเสียทำได้แค่เปลี่ยนชนิดไฟล์ เลื่อนเวลาให้ช้าลง ⏎ และเลือกเฉพาะซับบังคับ","แนะนำBDSup2Sub++ ⏎ ถ้าไฟล์ไหนอ่านไม่ได้ จะใช้ Subtitle Edit แทนเอง"],
  "ชนิดไฟล์": ["ชนิดไฟล์ของซับภาพที่จะได้","PGS .sup ซับภาพของ Blu-ray ภาพละไม่เกิน 255 สี ⏎ ข้อดีคมและใส่ใน MKV (Matroska Video) หรือแผ่น Blu-ray ได้","VobSub .idx ซับภาพของ DVD ได้ไฟล์ .idx กับ .sub คู่กัน ⏎ ข้อดีเครื่องเล่นรุ่นเก่ารับได้ และไฟล์เล็ก ⏎ ข้อเสียภาพละ 4 สี ขอบจึงหยาบกว่า","BDN XML ไฟล์ XML บอกเวลาและตำแหน่ง ⏎ กับภาพ PNG ทุกภาพในโฟลเดอร์เดียวกัน ⏎ ข้อดีเอาไปแก้ภาพต่อหรือใช้กับโปรแกรมทำแผ่นได้ ⏎ ข้อเสียเครื่องเล่นเปิดตรง ๆ ไม่ได้","แนะนำPGS .sup"],
  "ขนาดจอ": ["ขนาดจอของซับต้องเท่าภาพของหนังที่จะใส่ ซับจึงอยู่ตรงตำแหน่ง ⏎ ปิดไว้คือใช้ขนาดเดิมของไฟล์ต้นทาง","เปิด ย่อหรือขยายภาพซับทุกภาพให้พอดีจอใหม่ ⏎ และย้ายตำแหน่งตามสัดส่วน ⏎ ข้อดีใช้ซับ DVD กับหนัง HD ได้ ⏎ ข้อเสียภาพที่ขยายจะนุ่มลงเล็กน้อย","แนะนำขนาดเดียวกับหนังที่จะใส่ซับ"],
  "ย่อขยายภาพซับ": ["ย่อหรือขยายภาพซับเทียบกับจอ โดย 1 คือเท่าเดิม ⏎ ใช้ตอนที่ตัวหนังสือใหญ่หรือเล็กเกินไปหลังเปลี่ยนขนาดจอ","แนะนำ1 ทั้งสองค่า"],
  "วิธีย่อขยาย": ["วิธีคำนวณจุดภาพใหม่ตอนย่อหรือขยายภาพซับ","Bilinear เฉลี่ยจุดที่อยู่ติดกัน ⏎ ข้อดีเร็วและเรียบ ⏎ ข้อเสียนุ่มกว่าแบบอื่นเล็กน้อย","Bicubic คิดจากจุดรอบ ๆ มากขึ้น ⏎ ข้อดีคมกว่า Bilinear","Lanczos3 คิดจากจุดรอบ ๆ มากที่สุด ⏎ ข้อดีคมที่สุด ⏎ ข้อเสียขอบอาจมีเงาเส้นบาง ๆ","แบบอื่น Triangle Bell B-spline Hermite และ Mitchell ⏎ ให้ผลอยู่ระหว่างแบบข้างบน","แนะนำBilinear ตามค่าตั้งต้นของ BDSup2Sub"],
  "อัตราเฟรม": ["เปลี่ยนเวลาทุกภาพจากอัตราเฟรมต้นทางเป็นอัตราเฟรมปลายทาง ⏎ ใช้ตอนที่ซับมาจากหนังที่อัตราเฟรมต่างกัน เช่น 25 กับ 23.976","ต้นทาง อัตโนมัติ อ่านอัตราเฟรมจากไฟล์ซับ","ปลายทาง อัตราเฟรมของหนังที่จะใส่ซับ","แนะนำปิดไว้ เว้นแต่ซับเร็วหรือช้าขึ้นเรื่อย ๆ จนจบเรื่อง"],
  "เลื่อนเวลา": ["เลื่อนเวลาทุกภาพ ค่าบวกให้ซับขึ้นช้าลง ส่วนค่าลบให้ขึ้นเร็วขึ้น ⏎ หน่วยเป็นมิลลิวินาที โดย 1,000 คือหนึ่งวินาที","แนะนำ0"],
  "ภาพที่ขึ้นสั้นไป": ["ภาพที่ขึ้นสั้นกว่าขั้นต่ำ โปรแกรมจะยืดเวลาจบให้อ่านทัน","แนะนำปิดไว้ ถ้าเปิดใช้ 500 มิลลิวินาที"],
  "ย้ายแนวตั้ง": ["ย้ายซับแนวตั้งทุกภาพ แบบหน้าต่างย้ายซับทั้งหมดของ BDSup2Sub","ย้ายเข้าในภาพ ซับในแถบดำของหนังจอกว้าง ย้ายขึ้นมาอยู่ในภาพ ⏎ โดยคิดจากสัดส่วนภาพของหนัง เช่น 2.35 ⏎ ข้อดีเห็นซับเมื่อดูแบบตัดแถบดำ","ย้ายออกนอกภาพ ซับที่ทับภาพ ย้ายลงไปอยู่ในแถบดำ ⏎ ข้อดีซับไม่บังภาพ","เลื่อนขึ้นหรือลง เลื่อนทุกภาพจากตำแหน่งเดิมตามระยะที่ตั้ง"],
  "สัดส่วนภาพหนัง": ["สัดส่วนกว้างต่อสูงของภาพหนังไม่รวมแถบดำ ต้องเกิน 16:9 (1.78) ⏎ หนังจอกว้างส่วนมากเป็น 2.35 หรือ 2.40","แนะนำ2.35"],
  "ย้ายแนวนอน": ["ย้ายซับแนวนอนทุกภาพ","ชิดซ้าย ชิดขวา กึ่งกลาง วางทุกภาพชิดขอบหรือกลางจอ ⏎ แล้วเลื่อนตามระยะที่ตั้ง","ตำแหน่งเดิม ไม่ย้ายแนวนอน แต่เลื่อนตามระยะที่ตั้ง"],
  "จานสี": ["วิธีเลือกสีของภาพซับที่จะได้","คงเดิม ใช้จานสีของต้นทาง ⏎ ข้อดีสีตรงต้นฉบับ ⏎ ข้อเสียขอบหยาบเมื่อย่อขยาย","สร้างใหม่ คิดจานสีใหม่จากภาพหลังแปลง ⏎ ข้อดีขอบนุ่มหลังย่อขยาย","กระจายจุดสี สร้างจานสีใหม่แล้วกระจายจุดสีสลับกัน ⏎ ข้อดีสีไล่โทนเป็นขั้นน้อยลง ⏎ ข้อเสียมีจุดเล็ก ๆ ที่ขอบ","แนะนำสร้างใหม่ ตามค่าตั้งต้นของ BDSup2Sub"],
  "ภาพที่มองไม่เห็น": ["ภาพที่จานสีโปร่งใสทั้งหมดจนมองไม่เห็น จะแก้ให้ขึ้นได้ ⏎ ซับจากแผ่นบางแผ่นตั้งไว้แบบนี้","แนะนำปิด เว้นแต่ซับบางภาพหายไป"],
  "ซับบังคับ": ["ซับบังคับคือซับที่ขึ้นเสมอ เช่นป้ายหรือบทพูดภาษาอื่นในฉาก","ทุกภาพ แปลงทุกภาพในไฟล์","เฉพาะซับบังคับ แปลงเฉพาะภาพที่ติดป้ายซับบังคับ","ยกเว้นซับบังคับ แปลงทุกภาพที่ไม่ได้ติดป้ายซับบังคับ","แนะนำทุกภาพ"],
  "ป้ายซับบังคับ": ["เปลี่ยนป้ายซับบังคับของทุกภาพในไฟล์ที่จะได้","คงเดิม ป้ายตามไฟล์ต้นทาง","ติดทุกภาพ ทุกภาพเป็นซับบังคับ ตัวเล่นจึงขึ้นซับนี้เสมอ","เอาออกทุกภาพ ไม่มีภาพไหนเป็นซับบังคับ","แนะนำคงเดิม"],
  "ภาษาของ VobSub": ["ภาษาที่เขียนในไฟล์ .idx ซึ่งตัวเล่นใช้บอกชื่อภาษาของซับ"],
  "เกณฑ์ความทึบ": ["VobSub เก็บได้ 4 สี จุดที่ทึบน้อยกว่าเกณฑ์จะเป็นพื้นใส ⏎ ค่าน้อยเก็บขอบจางได้มากขึ้น ส่วนค่ามากขอบคมขึ้น","แนะนำ80 ตามค่าตั้งต้นของ BDSup2Sub"],
  "เกณฑ์ความสว่าง": ["แบ่งความสว่างเป็นสีเข้ม กลาง และสว่าง เพื่อเลือก 4 สีของ VobSub ⏎ ใส่ 0 คือใช้ค่าของ BDSup2Sub","แนะนำ0 ทั้งสองค่า"],
  "มุมมองภาพตัวอย่าง": ["เลือกวิธีดูภาพตัวอย่างของต้นฉบับกับผลที่จะได้ ซึ่งวางคู่กัน","ทั้งจอ วางซับบนจอเท่าขนาดจอของไฟล์ แล้วย่อให้พอดีกรอบ ⏎ ข้อดีเห็นตำแหน่งของซับบนจอ","ขนาดจริง ตัดเฉพาะส่วนที่มีตัวหนังสือ ⏎ โดยหนึ่งจุดของภาพเท่าหนึ่งจุดบนหน้าต่าง ⏎ ข้อดีเห็นความละเอียดที่เปลี่ยนหลังย่อขยายหรือลดสี ⏎ ข้อเสียซับยาวต้องเลื่อนดู ⏎ โดยเลื่อนกรอบหนึ่งแล้วอีกกรอบเลื่อนตาม","ขยาย 2 เท่า เหมือนขนาดจริงแต่ขยายสองเท่าแบบเห็นจุดภาพชัด ⏎ ข้อดีเห็นขอบตัวหนังสือกับสีที่ลดลงชัดขึ้น","แนะนำทั้งจอตอนตั้งตำแหน่ง ⏎ ส่วนขนาดจริงตอนดูความละเอียด"],
};

const optsBefore = await q("return localStorage.getItem('imgconv-opts')");
const viewBefore = await q("return localStorage.getItem('imgconv-view')");
await q("localStorage.removeItem('imgconv-opts'); localStorage.removeItem('imgconv-view'); window.__openDry = true; window.__openDryLog = []; return 1;");
try {
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await waitFor("return !!document.querySelector('.side .nav')", 20000);
  await nav("ซับไตเติล");
  await waitFor("return typeof window.__subClear === 'function'", 20000);

  /* ---------------------------------------------------------------- ปุ่มเปิดในตัวดูซับรูปภาพ */
  check("เปิดซับ PGS .sup แล้วตัวดูซับรูปภาพมีปุ่มแปลงซับภาพ", await openSub(SUP));
  const head = await q("const h = document.querySelector('.sv-imghead'); const s = h.querySelector('.small').getBoundingClientRect(); const b = h.querySelector('[data-imgconv-open]').getBoundingClientRect(); return { sameRow: b.top < s.bottom && b.bottom > s.top, right: Math.round(h.getBoundingClientRect().right - b.right), text: b.width > 0 ? h.querySelector('[data-imgconv-open]').innerText.trim() : '' };");
  // ปุ่ม OCR เป็นตัวหนังสืออยู่ขวาปุ่มแปลงซับภาพ (แผน OCR ขั้น 11 · ข้อ 143 ㉔) ปุ่มขวาสุดของแถวชิดขวาแทน
  const ocrBtn = await q("const h = document.querySelector('.sv-imghead'), b = h.querySelector('[data-ocr-open]'), a = h.querySelector('[data-imgconv-open]'); if (!b) return null; const r = b.getBoundingClientRect(), ra = a.getBoundingClientRect(); return { right: Math.round(h.getBoundingClientRect().right - r.right), after: r.left >= ra.right, row: Math.abs(r.top - ra.top) < 1 };");
  check("ปุ่มอยู่แถวเดียวกับข้อความสรุป ตามด้วยปุ่ม OCR ที่ชิดขวา", head.sameRow && head.text === "แปลงซับภาพ" && (ocrBtn ? ocrBtn.after && ocrBtn.row && ocrBtn.right <= 1 : head.right <= 1), JSON.stringify({ head, ocrBtn }));
  await c.shot(`${SHOT}/01-ปุ่มแปลงซับภาพในตัวดูซับ.png`, ".sv-imghead", 8);

  /* ---------------------------------------------------------------- เปิดหน้าต่าง ค่าตั้งต้น */
  check("กดปุ่มแล้วหน้าต่างแปลงซับภาพขึ้น", await openDlg());
  const size = await q("const d = document.querySelector('.dlg:has([data-icv])').getBoundingClientRect(); return [Math.round(d.width), Math.round(d.height)];");
  // ขนาดเปลี่ยนเป็นกว้าง 1120 สูงเต็มจอลบ 48 ตั้งแต่ commit e1e0359 ตัวตรวจค้างค่าเดิม (เจอ 16 พ.ย. 2569)
  check("หน้าต่าง 1280 × 800 กว้าง 1120 สูง 752 (ความสูงจอลบ 48)", size[0] === 1120 && size[1] === 752, size.join(" × "));
  await sleep(400);
  const p0 = await pathNow();
  check("ที่เก็บตั้งข้างไฟล์ต้นทาง ชื่อไม่ชนไฟล์เดิม", p0.replace(/\\/g, "/") === `${TMP}/ซับภาพ PGS.แปลง.sup`, p0);
  check("ภาพตัวอย่างของผลขึ้น", await prevDone());
  check("ภาพต้นฉบับขึ้น", await waitFor("return !!document.querySelector('[data-icv-frame=src] img')", 30000));
  const c0 = await caps();
  check("ป้ายภาพบอกต้นฉบับเป็น PGS กับไฟล์ที่จะได้เป็น PGS .sup พร้อมขนาดจอ", /^ต้นฉบับเป็น PGS จอ \d+ × \d+$/.test(c0[0]) && /^ไฟล์ที่จะได้เป็น PGS \.sup จอ \d+ × \d+$/.test(c0[1]), c0.join(" | "));
  const i0s = parseInfo(await info("src")), i0o = parseInfo(await info("out"));
  check("ค่าตั้งต้นภาพที่จะได้ขนาดและตำแหน่งเท่าต้นฉบับ (ป้ายนับจากส่วนที่มีภาพจริงทั้งสองฝั่ง)", i0s && i0o && Math.abs(i0s.w - i0o.w) <= 2 && Math.abs(i0s.h - i0o.h) <= 2 && Math.abs(i0s.x - i0o.x) <= 2 && Math.abs(i0s.y - i0o.y) <= 2, `${JSON.stringify(i0s)} ${JSON.stringify(i0o)}`);
  const src = c0[0].match(/(\d+) × (\d+)/).slice(1).map(Number);
  await rowsOk("ค่าตั้งต้น");
  const prevBtn = await q("const b = document.querySelector('[data-icv-prev]'); return [b.getAttribute('aria-disabled'), b.title]");
  check("ภาพแรกปุ่มภาพก่อนหน้ากดไม่ได้ พร้อมเหตุผล", prevBtn[0] === "true" && prevBtn[1] === "ภาพแรกแล้ว", prevBtn.join(" "));
  await c.shot(`${SHOT}/02-ค่าตั้งต้น-1280.png`, ".dlg", 6);

  /* ---------------------------------------------------------------- ภาพถัดไป (ไฟล์หลายภาพ) */
  await closeDlg();
  check("เปิดซับ PGS หลายภาพ", await openSub(MULTI));
  await openDlg(); await prevDone(); await sleep(400);
  const m0 = parseInfo(await info("out"));
  const nextOk = await q("const b = document.querySelector('[data-icv-next]'); return b.getAttribute('aria-disabled') !== 'true'");
  check("ไฟล์หลายภาพ ปุ่มภาพถัดไปกดได้", nextOk);
  const outBefore = await info("out");
  await click("[data-icv-next]");
  await waitFor(`return document.querySelector('[data-icv-info=out]')?.innerText.trim() !== ${JSON.stringify(outBefore)} && !document.querySelector('[data-icv-wait]')`, 20000);
  await waitFor("return !!document.querySelector('[data-icv-frame=src] img')", 20000); await sleep(400);
  const pick = await q("return document.querySelector('[data-icv-pick] .small').innerText.trim()");
  const m1s = parseInfo(await info("src")), m1o = parseInfo(await info("out"));
  check("กดภาพถัดไปแล้วเป็นภาพที่ 2 จาก 43 และเวลาเลยภาพแรก", pick === "ภาพที่ 2 จาก 43" && m1o && m0 && m1o.t > m0.t, `${pick} ${JSON.stringify(m0)} → ${JSON.stringify(m1o)}`);
  check("ภาพที่ 2 ต้นฉบับกับภาพที่จะได้เวลาและตำแหน่งตรงกัน", m1s && m1o && Math.abs(m1s.t - m1o.t) <= 0.05 && Math.abs(m1s.x - m1o.x) <= 2 && Math.abs(m1s.y - m1o.y) <= 2 && Math.abs(m1s.w - m1o.w) <= 2, `${JSON.stringify(m1s)} ${JSON.stringify(m1o)}`);
  await c.shot(`${SHOT}/02b-ภาพที่2-ไฟล์หลายภาพ.png`, "[data-icv-right]", 4);
  await closeDlg();

  /* ---------------------------------------------------------------- ตัวถอดภาพต้นฉบับอ่านไม่ได้ (จำลองด้วย window.__icvSrcFail · ไฟล์จริงที่ ffmpeg อ่านไม่ได้เปิดในหน้าซับไตเติลไม่ได้อยู่แล้ว) */
  await q("window.__icvSrcFail = true; return 1;");
  await openDlg();
  check("ฝั่งต้นฉบับบอกว่าตัวถอดอ่านไม่ได้ ไม่ค้างเป็นโครงจาง", await waitFor("return !!document.querySelector('[data-icv-src-err]')", 30000), await q("return document.querySelector('[data-icv-src-err]')?.innerText ?? ''"));
  await prevDone(); await sleep(300);
  const nsPick = await q("return document.querySelector('[data-icv-pick] .small').innerText.trim()");
  check("ภาพที่จะได้ยังขึ้น และนับภาพจากผลของ BDSup2Sub++ 43 ภาพ", nsPick === "ภาพที่ 1 จาก 43" && await q("return !!document.querySelector('[data-icv-frame=out] img')"), nsPick);
  await c.shot(`${SHOT}/02c-ต้นฉบับถอดไม่ได้.png`, "[data-icv-right]", 4);
  await closeDlg();
  await q("delete window.__icvSrcFail; return 1;");
  await openSub(SUP); await openDlg(); await prevDone(); await sleep(300);

  /* ---------------------------------------------------------------- เปลี่ยนขนาดจอ เลื่อนเวลา */
  const disabledRes = await q("return document.querySelector('[data-icv] button.dd[aria-label^=\"ขนาดจอ:\"]').title");
  check("สวิตช์ขนาดจอปิดอยู่ ดรอปดาวน์บอกเหตุผล", disabledRes === "เปิดสวิตช์ก่อน", disabledRes);
  await sw("เปลี่ยนขนาดจอ", true); await sleep(100);
  check("เลือกขนาดจอ 720p", await dd("ขนาดจอ", "720p 1280 × 720"));
  await num("icv-delay", 1000);
  await sleep(200); await prevDone();
  const c1 = await caps();
  const i2o = parseInfo(await info("out"));
  check("ป้ายภาพผลบอกจอ 1280 × 720", c1[1].endsWith("จอ 1280 × 720"), c1[1]);
  const sx = 1280 / src[0], sy = 720 / src[1];
  check("ตำแหน่งกับขนาดภาพย่อตามสัดส่วนจอ เทียบภาพที่จะได้ตอนขนาดเดิม", i2o && i0o && Math.abs(i2o.x - i0o.x * sx) <= 3 && Math.abs(i2o.y - i0o.y * sy) <= 3 && Math.abs(i2o.w - i0o.w * sx) <= 3, `${JSON.stringify(i2o)} คาด x ${Math.round(i0o.x * sx)} y ${Math.round(i0o.y * sy)} w ${Math.round(i0o.w * sx)}`);
  check("เลื่อนเวลา 1,000 มิลลิวินาทีแล้วเวลาภาพช้าลง 1 วินาที", i2o && i0o && Math.abs(i2o.t - i0o.t - 1) <= 0.05, `${i0o?.t} → ${i2o?.t}`);
  await rowsOk("เปิดขนาดจอ");
  await c.shot(`${SHOT}/03-ย่อเป็น720p-เลื่อนเวลา.png`, ".dlg", 6);

  /* ---------------------------------------------------------------- มุมมองเฉพาะตัวซับ (พี่กันขอ 15 พ.ย. 2569 ดูความละเอียดของซับที่เปลี่ยน) */
  check("เลือกมุมมองขนาดจริง", await seg("มุมมองภาพตัวอย่าง", "ขนาดจริง"));
  await sleep(300);
  const real = await q(`const r = {}; for (const k of ['src', 'out']) { const box = document.querySelector('[data-icv-crop=' + k + ']'); if (!box) { r[k] = null; continue; } const inner = box.querySelector('.icv-cropin').getBoundingClientRect(); const im = box.querySelector('img'); await im.decode(); r[k] = { inner: Math.round(inner.width), img: Math.round(im.getBoundingClientRect().width), nat: im.naturalWidth, h: Math.round(box.getBoundingClientRect().height), sw: box.scrollWidth, cw: box.clientWidth }; } return r;`);
  check("ขนาดจริง กรอบเฉพาะตัวซับขึ้นทั้งต้นฉบับและไฟล์ที่จะได้ สูงเท่ากัน 150", real.src && real.out && real.src.h === 150 && real.out.h === 150, JSON.stringify(real));
  check("ขนาดจริง หนึ่งจุดของภาพเท่าหนึ่งจุดบนหน้าต่าง", real.src && real.out && real.src.img === real.src.nat && real.out.img === real.out.nat, JSON.stringify(real));
  check("ขนาดจริง ภาพที่ย่อเป็น 720p แคบกว่าต้นฉบับตามสัดส่วนจอ", real.src && real.out && Math.abs(real.out.inner / real.src.inner - sx) < 0.03, `${real.out?.inner} / ${real.src?.inner} คาด ${sx.toFixed(3)}`);
  await q("const a = document.querySelector('[data-icv-crop=src]'); a.scrollLeft = a.scrollWidth; return 1;"); await sleep(250);
  const syncd = await q("const a = document.querySelector('[data-icv-crop=src]'), b = document.querySelector('[data-icv-crop=out]'); return [Math.round(a.scrollLeft / (a.scrollWidth - a.clientWidth) * 100), b.scrollWidth > b.clientWidth ? Math.round(b.scrollLeft / (b.scrollWidth - b.clientWidth) * 100) : -1];");
  check("เลื่อนกรอบต้นฉบับไปขวาสุด กรอบไฟล์ที่จะได้เลื่อนตามไปขวาสุด", syncd[0] === 100 && syncd[1] === 100, syncd.join(" "));
  await q("const a = document.querySelector('[data-icv-crop=src]'); a.scrollLeft = 0; return 1;"); await sleep(1500);
  await c.shot(`${SHOT}/03b-ขนาดจริง-720p.png`, "[data-icv-right]", 4);
  check("เลือกมุมมองขยาย 2 เท่า", await seg("มุมมองภาพตัวอย่าง", "ขยาย 2 เท่า"));
  await sleep(300);
  const zoom = await q(`const box = document.querySelector('[data-icv-crop=out]'); const im = box.querySelector('img'); return { img: Math.round(im.getBoundingClientRect().width), nat: im.naturalWidth, h: Math.round(box.getBoundingClientRect().height), px: getComputedStyle(im).imageRendering };`);
  check("ขยาย 2 เท่า ภาพกว้างสองเท่าของจุดภาพจริง เห็นจุดภาพชัด (pixelated) กรอบสูง 210", zoom.img === zoom.nat * 2 && zoom.px === "pixelated" && zoom.h === 210, JSON.stringify(zoom));
  // แถบเลื่อนลอยแนวนอน (ไม่จางเอง) ต้องตามกรอบที่สูงขึ้นไปอยู่ขอบล่างใหม่ เดิมค้างกลางกรอบทับตัวซับ (OverlayScrollbar.tsx)
  const thumb = await q("const t = document.querySelector('.ovthumb-h'); const bs = ['src', 'out'].map((k) => Math.round(document.querySelector('[data-icv-crop=' + k + ']').getBoundingClientRect().bottom)); return { op: t.style.opacity, top: Math.round(parseFloat(t.style.top)), bottoms: bs };");
  check("ขยาย 2 เท่า แถบเลื่อนแนวนอนตามไปอยู่ขอบล่างของกรอบใหม่ ไม่ค้างกลางกรอบ", thumb.op === "1" && thumb.bottoms.some((b) => Math.abs(thumb.top - (b - 9)) <= 1), JSON.stringify(thumb));
  await c.shot(`${SHOT}/03c-ขยาย2เท่า-720p.png`, "[data-icv-right]", 4);
  await closeDlg(); await openDlg(); await prevDone(); await sleep(300);
  check("ปิดแล้วเปิดใหม่ จำมุมมองขยาย 2 เท่าไว้", await q("return !!document.querySelector('[data-icv-crop=out].zoom')"));
  check("กลับเป็นมุมมองทั้งจอ", await seg("มุมมองภาพตัวอย่าง", "ทั้งจอ"));
  await sleep(300);

  /* ---------------------------------------------------------------- VobSub */
  check("เลือกชนิดไฟล์ VobSub", await seg("ชนิดไฟล์", "VobSub .idx"));
  await sleep(200);
  check("ที่เก็บเปลี่ยนนามสกุลเป็น .idx", (await pathNow()).endsWith(".แปลง.idx"), await pathNow());
  const vobRows = await q("return ['lang', 'alpha', 'lum'].map((k) => !!document.querySelector(`[data-icv-row=${k}]`))");
  check("ตัวเลือกเฉพาะ VobSub ขึ้นครบ ภาษา เกณฑ์ความทึบ เกณฑ์ความสว่าง", vobRows.every(Boolean), vobRows.join(" "));
  const langNow = await q("return document.querySelector('[data-icv] button.dd[aria-label^=\"ภาษา:\"]')?.getAttribute('aria-label')");
  check("ภาษาของ VobSub ตั้งต้นตามภาษาของแทร็ก (ไฟล์ .sup ไม่บอกภาษา จึงเป็นอังกฤษ en)", langNow === "ภาษา: อังกฤษ en", langNow);
  await prevDone(); await sleep(300);
  const nc = await colors();
  check("ภาพตัวอย่าง VobSub เหลือไม่เกิน 4 สีรวมพื้นใส", nc > 0 && nc <= 4, String(nc));
  const c2 = await caps();
  check("ป้ายภาพผลบอกไฟล์ที่จะได้เป็น VobSub .idx", c2[1].startsWith("ไฟล์ที่จะได้เป็น VobSub .idx"), c2[1]);
  await rowsOk("VobSub");
  await q("document.querySelector('[data-icv-row=lang]')?.scrollIntoView({ block: 'end' }); return 1;"); await sleep(150);
  await c.shot(`${SHOT}/04-VobSub-ตัวเลือกเฉพาะ.png`, ".dlg", 6);

  /* ---------------------------------------------------------------- แปลงจริง VobSub */
  const outIdx = `${TMP}/ผล VobSub.idx`;
  await q(`window.__imgTarget = ${JSON.stringify(outIdx)}; return 1;`);
  await click("[data-icv-browse]"); await sleep(300);
  check("เปลี่ยนที่เก็บผ่านทางลัดของตัวตรวจ", (await pathNow()).replace(/\\/g, "/") === outIdx, await pathNow());
  await click("[data-icv-go]");
  check("แปลงเป็น VobSub เสร็จ", await waitFor("return !!document.querySelector('[data-icv-done]') || !!document.querySelector('[data-icv-err]')", 120000) && await q("return !!document.querySelector('[data-icv-done]')"), await q("return document.querySelector('[data-icv-status]')?.innerText ?? ''"));
  const doneTxt = await q("return document.querySelector('[data-icv-done]')?.innerText ?? ''");
  check("ผลบอกชื่อไฟล์ .idx กับ .sub จำนวนภาพ และจอ 1280 × 720", /แปลงแล้ว ผล VobSub\.idx กับ ผล VobSub\.sub/.test(doneTxt) && /ได้ \d+ ภาพ ไฟล์ขนาด .+ จอ 1280 × 720/.test(doneTxt), doneTxt.replace(/\n/g, " "));
  const pv = existsSync(outIdx) && existsSync(outIdx.replace(/\.idx$/, ".sub")) ? probe(outIdx) : {};
  check("ไฟล์ .idx กับ .sub มีจริง ffprobe อ่านเป็น dvd_subtitle 1280 × 720", pv.codec_name === "dvd_subtitle" && pv.width === 1280 && pv.height === 720, JSON.stringify(pv));
  check("ไม่มีโฟลเดอร์พักงานค้างข้างไฟล์", readdirSync(TMP).every((f) => !f.startsWith(".imgconv-")), readdirSync(TMP).join(" | "));
  await c.shot(`${SHOT}/05-แปลงเสร็จ.png`, ".dlg", 6);
  await click("[data-icv-reveal]"); await sleep(200);
  const log = await q("return window.__openDryLog ?? []");
  check("ปุ่มเปิดโฟลเดอร์ส่งไฟล์ผลไป Explorer (ทางลัดของตัวตรวจ ไม่เปิดจริง)", log.some((f) => f.replace(/\\/g, "/") === outIdx), log.join(" | "));

  /* ---------------------------------------------------------------- ไม่เขียนทับ */
  const before = statSync(outIdx).mtimeMs;
  await click("[data-icv-go]");
  check("แปลงซ้ำที่ชื่อเดิม ขึ้นบอกว่ามีอยู่แล้วและไม่เขียนทับ", await waitFor("return !!document.querySelector('[data-icv-exists]')", 120000) && statSync(outIdx).mtimeMs === before, await q("return document.querySelector('[data-icv-status]')?.innerText ?? ''"));
  await click("[data-icv-renum]");
  check("ตั้งชื่อใหม่ต่อเลขแล้วแปลงเสร็จ", await waitFor("return !!document.querySelector('[data-icv-done]')", 120000));
  const idxs = readdirSync(TMP).filter((f) => f.startsWith("ผล VobSub") && f.endsWith(".idx"));
  check("มีไฟล์ .idx สองไฟล์ ไฟล์เดิมไม่ถูกแตะ", idxs.length === 2 && statSync(outIdx).mtimeMs === before, idxs.join(" | "));

  /* ---------------------------------------------------------------- BDN XML */
  check("เลือกชนิดไฟล์ BDN XML", await seg("ชนิดไฟล์", "BDN XML"));
  await sleep(200);
  const vobGone = await q("return !document.querySelector('[data-icv-row=lang]')");
  check("ตัวเลือกเฉพาะ VobSub ซ่อนเมื่อไม่ใช่ VobSub", vobGone);
  const outXml = `${TMP}/ผล BDN.xml`;
  await q(`window.__imgTarget = ${JSON.stringify(outXml)}; return 1;`);
  await click("[data-icv-browse]"); await sleep(200);
  await click("[data-icv-go]");
  check("แปลงเป็น BDN XML เสร็จ", await waitFor("return !!document.querySelector('[data-icv-done]') || !!document.querySelector('[data-icv-err]')", 120000) && await q("return !!document.querySelector('[data-icv-done]')"));
  const bdnDir = `${TMP}/ผล BDN`;
  const pngs = existsSync(bdnDir) ? readdirSync(bdnDir).filter((f) => f.endsWith(".png")).length : 0;
  check("ได้โฟลเดอร์ ผล BDN มีไฟล์ XML กับภาพ PNG", existsSync(`${bdnDir}/ผล BDN.xml`) && pngs > 0, `${pngs} ภาพ`);

  /* ---------------------------------------------------------------- จำค่า ค่าตั้งต้น Esc */
  await closeDlg();
  await openDlg(); await sleep(300);
  const kept = await q("const g = [...document.querySelectorAll('[data-icv] .seg')].find((s) => s.getAttribute('aria-label') === 'ชนิดไฟล์'); return g.querySelector('button.on, button[aria-pressed=true]')?.innerText.trim()");
  const keptRes = await q("return document.querySelector('[data-icv] button.switch[aria-label=\"เปลี่ยนขนาดจอ\"]').getAttribute('aria-checked')");
  check("ปิดแล้วเปิดใหม่ จำชนิดไฟล์กับสวิตช์ขนาดจอไว้", kept === "BDN XML" && keptRes === "true", `${kept} ${keptRes}`);
  check("ปิดแล้วเปิดใหม่กับไฟล์เดิม ภาพต้นฉบับโหลดใหม่ ไม่ค้างเป็นโครงจาง", await waitFor("return !!document.querySelector('[data-icv-frame=src] img')", 20000));
  await click("[data-icv-reset]"); await sleep(200);
  const reset = await q("return [document.querySelector('[data-icv] button.switch[aria-label=\"เปลี่ยนขนาดจอ\"]').getAttribute('aria-checked'), document.querySelector('[data-icv] [data-style-num=icv-delay]').value]");
  check("ปุ่มค่าตั้งต้นปิดขนาดจอและเลื่อนเวลาเป็น 0", reset[0] === "false" && reset[1] === "0", reset.join(" "));
  await esc(); await sleep(300);
  const escd = await q("return [!!document.querySelector('[data-icv]'), !!document.querySelector('[data-subviewer]')]");
  check("Esc ปิดเฉพาะหน้าต่างแปลง ตัวดูซับยังอยู่", !escd[0] && escd[1], escd.join(" "));

  /* ---------------------------------------------------------------- Subtitle Edit */
  await openDlg(); await prevDone();
  await click('[data-icv-engine="seconv"]'); await sleep(300);
  const se = await q("return { note: !!document.querySelector('[data-icv-se-note]'), res: !!document.querySelector('[data-icv-row=res]'), fps: !!document.querySelector('[data-icv-row=fps]'), move: !!document.querySelector('[data-icv-row=move-y]'), forced: [...document.querySelector('[data-icv] .seg[aria-label=\"ภาพที่แปลง\"]').querySelectorAll('button')].map((b) => b.innerText.trim()).join(',') };");
  check("Subtitle Edit ซ่อนขนาดจอ อัตราเฟรม ตำแหน่ง และบอกเหตุผล", se.note && !se.res && !se.fps && !se.move, JSON.stringify(se));
  check("Subtitle Edit เลือกซับบังคับได้สองแบบ", se.forced === "ทุกภาพ,เฉพาะซับบังคับ", se.forced);
  await num("icv-delay", 300); await sleep(100);
  await num("icv-delay", -500); await sleep(100);
  await q("document.querySelector('[data-icv] [data-style-num=icv-delay]').blur(); return 1;"); await sleep(100);
  const neg = await q("return document.querySelector('[data-icv] [data-style-num=icv-delay]').value");
  check("Subtitle Edit เลื่อนเวลาถอยหลังไม่ได้ ค่าลบเป็น 0", neg === "0", neg);
  check("ภาพตัวอย่างของ Subtitle Edit ขึ้น", await prevDone() && await q("return !!document.querySelector('[data-icv-frame=out] img')"));
  await rowsOk("Subtitle Edit");
  await c.shot(`${SHOT}/06-SubtitleEdit.png`, ".dlg", 6);
  await click('[data-icv-engine="bdsup"]'); await sleep(200);
  await closeDlg();

  /* ---------------------------------------------------------------- ไฟล์ที่ BDSup2Sub++ อ่านไม่ได้ (BUGS 128) */
  // BDSup2Sub++ หยุดทำงานกับไฟล์นี้ การ์ดจางกดไม่ได้พร้อมเหตุผล แล้วใช้ Subtitle Edit แทนเอง เฉพาะไฟล์นี้ ค่าที่จำไว้ยังเป็น BDSup2Sub++
  check("เปิด VobSub รุ่นเก่าที่ BDSup2Sub++ อ่านไม่ได้", await openSub(BADIDX));
  const engSaved = () => q("try { return JSON.parse(localStorage.getItem('imgconv-opts') || '{}').engine ?? 'bdsup'; } catch { return '?'; }");
  check("ก่อนเปิดหน้าต่าง ตัวแปลงที่จำไว้เป็น BDSup2Sub++", (await engSaved()) === "bdsup", await engSaved());
  await openDlg();
  const engState = () => q("const b = document.querySelector('[data-icv-engine=bdsup]'), s = document.querySelector('[data-icv-engine=seconv]'); return { bad: b.hasAttribute('data-icv-bdbad'), off: b.classList.contains('off'), dis: b.getAttribute('aria-disabled'), note: b.querySelector('.small').innerText.trim(), title: b.title, se: s.getAttribute('aria-checked'), bd: b.getAttribute('aria-checked'), seNote: !!document.querySelector('[data-icv-se-note]') };");
  check("BDSup2Sub++ อ่านไม่ได้ สลับไปใช้ Subtitle Edit เอง ภาพตัวอย่างขึ้นโดยไม่ต้องกดอะไร", await waitFor("return !!document.querySelector('[data-icv-frame=out] img') && !document.querySelector('[data-icv-wait]')", 120000) && !(await q("return !!document.querySelector('[data-icv-prev-err]')")), await q("return document.querySelector('[data-icv-prev-err]')?.innerText ?? ''"));
  const eb = await engState();
  check("การ์ด BDSup2Sub++ จางกดไม่ได้ บอกเหตุผลบนการ์ดและตอนชี้ การ์ด Subtitle Edit ถูกเลือก ตัวเลือกที่ Subtitle Edit ทำไม่ได้ซ่อน", eb.bad && eb.off && eb.dis === "true" && eb.note === "อ่านไฟล์นี้ไม่ได้ จึงใช้ Subtitle Edit แทน" && eb.title === eb.note && eb.se === "true" && eb.bd === "false" && eb.seNote, JSON.stringify(eb));
  check("การ์ดที่จางไม่มีป้ายแนะนำ", !(await q("return !!document.querySelector('[data-icv-engine=bdsup] .icv-badge')")));
  check("ไม่มีปุ่มใช้ Subtitle Edit แทนให้กดเองแล้ว", !(await q("return !!document.querySelector('[data-icv-use-se], [data-icv-use-se2]')")));
  check("สลับเฉพาะไฟล์นี้ ตัวแปลงที่จำไว้ยังเป็น BDSup2Sub++", (await engSaved()) === "bdsup", await engSaved());
  await click('[data-icv-engine="bdsup"]'); await sleep(300);
  check("กดการ์ด BDSup2Sub++ ที่จางอยู่ ไม่เปลี่ยนกลับ", (await engState()).se === "true");
  const cardH = await q("return [...document.querySelectorAll('[data-icv-engine]')].map((b) => Math.round(b.getBoundingClientRect().height))");
  check("การ์ดสองใบสูงเท่ากันตอนขึ้นเหตุผล ข้อความบนการ์ดไม่ตกบรรทัด", cardH[0] === cardH[1] && (await q("const n = document.querySelector('[data-icv-engine=bdsup] .small'); return n.scrollWidth <= n.clientWidth + 1 && n.getClientRects().length === 1;")), JSON.stringify(cardH));
  await waitFor("return !!document.querySelector('[data-icv-frame=src] img')", 60000);
  const capVob = (await caps())[0];
  check("ป้ายภาพต้นฉบับบอกเป็น VobSub จอ 720 × 480", capVob === "ต้นฉบับเป็น VobSub จอ 720 × 480", capVob);
  await c.shot(`${SHOT}/07-อ่านไม่ได้-สลับเป็นSubtitleEdit.png`, ".dlg", 6);
  await c.shot(`${SHOT}/07b-การ์ดตัวแปลง-จาง.png`, ".icv-engs", 10);
  const outSe = `${TMP}/ผลจาก Subtitle Edit.sup`;
  await q(`window.__imgTarget = ${JSON.stringify(outSe)}; return 1;`);
  await seg("ชนิดไฟล์", "PGS .sup"); await sleep(100);
  await click("[data-icv-browse]"); await sleep(200);
  await click("[data-icv-go]");
  check("แปลงด้วย Subtitle Edit เสร็จ", await waitFor("return !!document.querySelector('[data-icv-done]') || !!document.querySelector('[data-icv-err]')", 120000) && await q("return !!document.querySelector('[data-icv-done]')"), await q("return document.querySelector('[data-icv-status]')?.innerText ?? ''"));
  const pse = existsSync(outSe) ? probe(outSe) : {};
  check("ไฟล์ .sup ที่ได้ ffprobe อ่านเป็น hdmv_pgs_subtitle", pse.codec_name === "hdmv_pgs_subtitle", JSON.stringify(pse));
  await c.shot(`${SHOT}/08-SubtitleEdit-แปลงเสร็จ.png`, ".dlg", 6);
  await closeDlg();
  // กดแปลงทันทีก่อนภาพตัวอย่างรู้ว่าอ่านไม่ได้ (ภาพตัวอย่างรอหยุดปรับ 600 มิลลิวินาที) ตอนแปลงล้มต้องแปลงซ้ำด้วย Subtitle Edit เอง ไม่ขึ้นกล่องแดง
  await openDlg();
  const outFast = `${TMP}/แปลงเร็วก่อนภาพตัวอย่าง.sup`;
  await q(`window.__imgTarget = ${JSON.stringify(outFast)}; return 1;`);
  check("เปิดหน้าต่างใหม่กับไฟล์เดิม เริ่มที่ BDSup2Sub++ ตามที่จำไว้", (await engState()).bd === "true", JSON.stringify(await engState()));
  await click("[data-icv-browse]"); await sleep(120);
  await click("[data-icv-go]");
  check("กดแปลงก่อนภาพตัวอย่างเสร็จ BDSup2Sub++ ล้มแล้วแปลงซ้ำด้วย Subtitle Edit จนเสร็จ ไม่ขึ้นกล่องแปลงไม่สำเร็จ", await waitFor("return !!document.querySelector('[data-icv-done]') || !!document.querySelector('[data-icv-err]')", 120000) && await q("return !!document.querySelector('[data-icv-done]') && !document.querySelector('[data-icv-err]')") && existsSync(outFast) && probe(outFast).codec_name === "hdmv_pgs_subtitle", await q("return document.querySelector('[data-icv-status]')?.innerText ?? ''"));
  check("หลังแปลงซ้ำ การ์ด BDSup2Sub++ จางและการ์ด Subtitle Edit ถูกเลือก", (await engState()).bad && (await engState()).se === "true", JSON.stringify(await engState()));
  await closeDlg();

  /* ---------------------------------------------------------------- ซับภาพของแผ่น HD DVD (BUGS 129) */
  // เดิมหน้าซับไตเติลขึ้นว่าอ่านไฟล์ไม่ได้ เพราะ mkvmerge ไม่รู้จัก · ตอนนี้ BDSup2Sub++ แปลงเป็น PGS ไว้ในโฟลเดอร์ทำงานให้ตัวดูซับรูปถอดภาพ
  const hdBefore = readFileSync(HDDVD);
  check("เปิดซับ HD DVD ในหน้าซับไตเติลได้ ตัวดูซับรูปภาพมีปุ่มแปลงซับภาพ", await openSub(HDDVD), await q("return document.querySelector('[data-subpage] .stat.bad, .sub-err, [data-sub-err]')?.innerText ?? ''"));
  // ไฟล์ซับเดี่ยวไม่มีปุ่มเลือกแทร็ก ชนิดซับบอกที่หัวตัวดูซับรูปภาพ
  const hdHead = await q("return document.querySelector('.sv-imghead .small')?.innerText.replace(/\\s+/g, ' ').trim() ?? ''");
  check("หัวตัวดูซับบอกว่าเป็นซับรูปภาพแบบ HD DVD (ถอดไว้แล้วมีจำนวนภาพต่อท้าย)", /^ซับที่เพิ่มเข้ามาเป็นซับรูปภาพแบบ HD DVD( มี [\d,]+ ภาพ)?$/.test(hdHead), hdHead);
  check("ภาพซับขึ้นในตัวดูซับรูปภาพ", await waitFor("return document.querySelectorAll('[data-subviewer][data-mode=image] img').length > 0", 60000), String(await q("return document.querySelectorAll('[data-subviewer][data-mode=image] img').length")));
  await c.shot(`${SHOT}/10-HD-DVD-ตัวดูซับ.png`, "[data-subviewer]", 6);
  await openDlg();
  check("หน้าต่างแปลงซับภาพของซับ HD DVD ภาพตัวอย่างของผลขึ้นด้วย BDSup2Sub++", await prevDone(90000) && await q("return !!document.querySelector('[data-icv-frame=out] img') && !document.querySelector('[data-icv-prev-err]') && document.querySelector('[data-icv-engine=bdsup]').getAttribute('aria-checked') === 'true'"), await q("return document.querySelector('[data-icv-prev-err]')?.innerText ?? ''"));
  check("ภาพต้นฉบับขึ้นจากตัวถอดเดิม", await waitFor("return !!document.querySelector('[data-icv-frame=src] img')", 60000));
  const hdCaps = await caps();
  check("ป้ายภาพบอกต้นฉบับเป็น HD DVD จอ 720 × 576", hdCaps[0] === "ต้นฉบับเป็น HD DVD จอ 720 × 576", hdCaps.join(" | "));
  const hdIntro = await q("return document.querySelector('[data-icv] .icv-intro')?.innerText.replace(/\\s+/g, ' ').trim() ?? ''");
  check("คำอธิบายบนหน้าต่างบอกว่าแปลงซับภาพ HD DVD", hdIntro.startsWith("แปลงซับภาพ HD DVD เป็นไฟล์ชนิดอื่น"), hdIntro);
  const outHd = `${TMP}/จาก HD DVD.sup`;
  await q(`window.__imgTarget = ${JSON.stringify(outHd)}; return 1;`);
  await click("[data-icv-browse]"); await sleep(200);
  await click("[data-icv-go]");
  check("แปลงซับ HD DVD เป็น PGS เสร็จ ได้ 630 ภาพ", await waitFor("return !!document.querySelector('[data-icv-done]') || !!document.querySelector('[data-icv-err]')", 120000) && /630 ภาพ/.test(await q("return document.querySelector('[data-icv-done]')?.innerText ?? ''")), await q("return document.querySelector('[data-icv-status]')?.innerText ?? ''"));
  const phd = existsSync(outHd) ? probe(outHd) : {};
  check("ไฟล์ที่ได้ ffprobe อ่านเป็น hdmv_pgs_subtitle จอ 720 × 576", phd.codec_name === "hdmv_pgs_subtitle" && phd.width === 720 && phd.height === 576, JSON.stringify(phd));
  check("ไฟล์ซับ HD DVD ต้นฉบับไม่ถูกแตะ", Buffer.compare(readFileSync(HDDVD), hdBefore) === 0);
  await c.shot(`${SHOT}/11-HD-DVD-แปลงเสร็จ.png`, ".dlg", 6);
  await closeDlg();

  /* ---------------------------------------------------------------- ซับรูปในไฟล์ MKV */
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(MKV)}); return 1;`);
  // แทร็กเลือกจากดรอปดาวน์ในแถบชื่อโปรแกรม (BUGS ข้อ 149)
  await waitFor("return (window.__subTracks?.().list.length ?? 0) > 0", 30000);
  await q("const k = window.__subTracks().list.findIndex((x) => /PGS|VobSub/.test(x)); if (k >= 0) window.__subPick(k); return 1;");
  check("ซับรูปในไฟล์ MKV มีปุ่มแปลงซับภาพ", await waitFor("return !!document.querySelector('[data-imgconv-open]')", 30000));
  await openDlg(); await sleep(400);
  const pm = await pathNow();
  check("ที่เก็บของซับในหนังตั้งเป็นชื่อหนังต่อภาษาข้างไฟล์หนัง", /ซับรูป \(2024\)\.[a-z]{3}\.sup$/.test(pm.replace(/\\/g, "/")) && pm.replace(/\\/g, "/").startsWith(TMP), pm);
  check("ภาพตัวอย่างของซับในหนังขึ้น", await prevDone(90000) && await q("return !!document.querySelector('[data-icv-frame=out] img')"));
  check("ไฟล์ถัดไปกลับมาใช้ BDSup2Sub++ ตามที่จำไว้ การ์ดไม่จาง (BUGS 128)", await q("const b = document.querySelector('[data-icv-engine=bdsup]'); return b.getAttribute('aria-checked') === 'true' && !b.classList.contains('off') && !b.hasAttribute('data-icv-bdbad');"));
  await closeDlg();

  /* ---------------------------------------------------------------- กล่อง ⓘ */
  await openSub(SUP); await openDlg(); await prevDone();
  await seg("ชนิดไฟล์", "VobSub .idx"); await sw("ย้ายตำแหน่ง", true); await sleep(100); await dd("ย้ายแนวตั้ง", "ย้ายเข้าในภาพ"); await sleep(300);
  const titles = await q("return [...document.querySelectorAll('[data-icv] .infob')].map((b) => b.dataset.info)");
  check("กล่อง ⓘ ครบทุกตัวเลือก (20 กล่องตอนเปิด VobSub กับย้ายเข้าในภาพ)", titles.length === 20, titles.join(", "));
  for (const t of titles) {
    const got = await tipLines(t);
    if (DUMP) { console.log(`  ${JSON.stringify(t)}: ${JSON.stringify(got)},`); continue; }
    check(`กล่อง ⓘ ${t} ตัดบรรทัดตรงที่อ่านไว้`, JSON.stringify(got) === JSON.stringify(TIPS[t]), JSON.stringify(got));
  }
  await sw("ย้ายตำแหน่ง", false);
  await closeDlg();

  /* ---------------------------------------------------------------- จอใหญ่ */
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1032, deviceScaleFactor: 1, mobile: false });
  await sleep(300);
  await openDlg(); await prevDone(); await sleep(300);
  const big = await q("const d = document.querySelector('.dlg:has([data-icv])').getBoundingClientRect(); return [Math.round(d.width), Math.round(d.height)];");
  check("หน้าต่าง 1920 × 1032 กว้าง 1120 สูง 984 (ความสูงจอลบ 48)", big[0] === 1120 && big[1] === 984, big.join(" × "));
  await rowsOk("จอ 1920");
  await c.shot(`${SHOT}/09-จอ1920.png`, ".dlg", 6);
  await closeDlg();
} finally {
  await q("delete window.__imgTarget; delete window.__openDry; delete window.__openDryLog; delete window.__icvSrcFail; return 1;").catch(() => null);
  await q(`const v = ${JSON.stringify(optsBefore)}; if (v == null) localStorage.removeItem('imgconv-opts'); else localStorage.setItem('imgconv-opts', v); const w = ${JSON.stringify(viewBefore)}; if (w == null) localStorage.removeItem('imgconv-view'); else localStorage.setItem('imgconv-view', w); return 1;`).catch(() => null);
  await q("window.__subClear?.(); return 1;").catch(() => null);
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => null);
  rmSync(TMP, { recursive: true, force: true });
}

const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass} จาก ${results.length} ข้อ · ภาพอยู่ ${SHOT}`);
process.exit(pass === results.length ? 0 : 1);
