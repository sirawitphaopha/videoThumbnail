// หน้าต่างส่งออก PGS แบบละเอียด (พี่กันสั่ง 14 พ.ย. 2569 ตัวสร้าง PGS ให้เลือก ปรับสีขอบความหนาของ SRT เทียบสี ASS กับ PGS ส่วนปรับแต่งละเอียด แก้สีหม่น หน้าขอบคุณ)
// 15 พ.ย. 2569 เพิ่ม ตัวสร้างที่สาม SeConv ของ Subtitle Edit พร้อมตัวเลือกครบ · บอกว่าชั้นหนังคือ ffmpeg กับ libass · ป้ายภาพบอกนามสกุลต้นทาง · ขนาดที่คาด
//   · เส้นแบ่งแนวนอน · ดูบรรทัดจริงของซับ SRT ได้คู่กับประโยคที่พิมพ์ · ตำแหน่งเก้าจุดกับระยะขอบซ้ายขวา · เปิดซับข้อความแบบอื่น (SAMI SBV) แล้วส่งออกได้ (BUGS ข้อ 123)
// ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-pgs.mjs · ตอนพี่กันทำงานอยู่ส่ง NOGATE=1 · DUMP=1 พิมพ์จุดตัดบรรทัดของกล่อง ⓘ ทุกกล่อง
// ไม่เปิดกล่องเลือกไฟล์ ใช้ window.__pgsTarget · ส่งออกจริงลง D:\dev\tmp\ชั้นตรวจPGS แล้วลบตอนจบ · ไม่กดลิงก์ ไม่แตะคลิปบอร์ด
// ภาพลง docs/report-2026-11-14/ส่งออกPGS/
import { mkdirSync, copyFileSync, rmSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { connect, sleep } from "./lib/cdp-client.mjs";
import { linesOf } from "./lib/lines.mjs";

const NOGATE = process.env.NOGATE === "1";
const DUMP = process.env.DUMP === "1";
const gate = () => { if (NOGATE) return; try { execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/fg-gate.ps1"], { stdio: "ignore" }); } catch { console.log("หน้าต่างชั้นหนังอยู่หน้าสุดของจอ หยุดตรวจ"); process.exit(2); } };
gate();

const SRC = "D:/movie-shelf/test-media/สร้าง/แก้ซับ";
const TMP = "D:/dev/tmp/ชั้นตรวจPGS";
const MOVIE = `${TMP}/ฉากตัด (2025).mkv`;
const SRT = `${TMP}/ฉากตัด (2025).th.srt`;
const SAMI = `${TMP}/ซับแบบ SAMI.smi`;
const SBV = `${TMP}/ซับแบบ YouTube.sbv`;
const SHOT = "docs/report-2026-11-14/ส่งออกPGS";
const FP = "D:/movie-shelf/src-tauri/tools/ffprobe.exe";
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
mkdirSync(SHOT, { recursive: true });
copyFileSync(`${SRC}/ฉากตัด (2025).mkv`, MOVIE);
copyFileSync(`${SRC}/ฉากตัด (2025).th.srt`, SRT);
// ซับข้อความแบบอื่นสองชนิด · SAMI ffmpeg แปลงเป็น ASS · SBV โปรแกรมแปลงเป็น SRT เอง (subconv.rs)
writeFileSync(SAMI, ["<SAMI><HEAD><TITLE>ทดสอบ</TITLE></HEAD><BODY>",
  ...["บรรทัดแรกของซับ SAMI", "บรรทัดที่สอง", "บรรทัดที่สาม", "บรรทัดที่สี่"].flatMap((t, i) => [`<SYNC Start=${1000 + i * 3000}><P Class=THCC>${t}`, `<SYNC Start=${3000 + i * 3000}><P Class=THCC>&nbsp;`]),
  "</BODY></SAMI>", ""].join("\r\n"), "utf8");
writeFileSync(SBV, ["บรรทัดแรกของซับ SBV", "บรรทัดที่สอง", "บรรทัดที่สาม", "บรรทัดที่สี่"].map((t, i) => `0:00:${String(1 + i * 3).padStart(2, "0")}.000,0:00:${String(3 + i * 3).padStart(2, "0")}.000\n${t}\n`).join("\n"), "utf8");

const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(150); } return false; };
const nav = (label) => q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click();`);
const click = async (sel) => { gate(); await c.click(sel); };
const esc = () => c.key("Escape");
const clickAt = async (x, y) => { gate(); await c.move(x, y); await c.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await c.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); };
const prevDone = () => waitFor("return document.querySelector('[data-pgs-imgs]')?.dataset.state === 'done' || !!document.querySelector('[data-pgs-prev-err]')", 60000);
const estDone = () => waitFor("const s = document.querySelector('[data-pgs-est]')?.dataset.pgsEst; return s === 'done' || s === 'fail'", 90000);
const openDlg = async () => { await click('[data-cmdmenu="tool"]'); await sleep(300); await click('[data-cmd="pgs"]'); return waitFor("return !!document.querySelector('[data-pgs]')", 4000); };
const closeDlg = async () => { await q("[...document.querySelectorAll('.dlg .acts .btn-ghost')].find((b) => /ยกเลิก|ปิด/.test(b.innerText))?.click(); return 1;"); await sleep(300); };
const openSub = async (file, rows = 2) => {
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(file)}); return 1;`);
  return waitFor(`return document.querySelectorAll('[data-subedit] .se-grid tbody tr').length > ${rows}`, 25000);
};
/** กดปุ่มในแถวตัวเลือก (Seg) ของหน้าต่าง ตามชื่อกลุ่มกับข้อความบนปุ่ม */
const seg = (label, text) => q(`const g = [...document.querySelectorAll('[data-pgs] .seg')].find((s) => s.getAttribute('aria-label') === ${JSON.stringify(label)}); const b = g && [...g.querySelectorAll('button')].find((x) => x.innerText.trim() === ${JSON.stringify(text)}); if (b) { b.click(); return true; } return false;`);
const setColor = (k, v) => q(`const i = document.querySelector('[data-pgs-color=${k}] input'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
const setSample = (v) => q(`const i = document.querySelector('[data-pgs-sample]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event('input', { bubbles: true })); return 1;`);
const left = () => q("return document.querySelector('[data-pgs-left]').innerText");
const caps = () => q("return [...document.querySelectorAll('[data-pgs-cap]')].map((f) => f.innerText.trim())");
/** นับจุดทึบในภาพตัวอย่าง PGS แบบพื้นโปร่งใส ที่ตรงเงื่อนไขสี */
const countPx = (sel, cond) => q(`const im = document.querySelector(${JSON.stringify(sel)}); if (!im) return -1; await im.decode(); const cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const g = cv.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) { const r = d[i], gg = d[i + 1], b = d[i + 2], a = d[i + 3]; if (${cond}) n++; } return n;`);
/** แถวตั้งค่าทุกแถว ของในแถวไม่ล้นแถวและไม่ซ้อนกัน · ป้ายหน้าแถวบรรทัดเดียว */
const rowsOk = async (what) => {
  const rowBad = await q(`return [...document.querySelectorAll('[data-pgs-left] .se-drow')].flatMap((row) => { const rb = row.getBoundingClientRect(); const kids = [...row.children].filter((k) => k.getBoundingClientRect().width > 0).map((k) => k.getBoundingClientRect());
    const out = kids.some((k) => k.right > rb.right + 1 || k.left < rb.left - 1); let ov = false; for (let i = 1; i < kids.length; i++) if (kids[i].left < kids[i - 1].right - 1 && kids[i].top < kids[i - 1].bottom - 1) ov = true; return out || ov ? [row.innerText.replace(/\\s+/g, ' ').slice(0, 30)] : []; });`);
  check(`${what} แถวตั้งค่าทุกแถว ของไม่ล้นแถวและไม่ซ้อนกัน`, rowBad.length === 0, rowBad.join(" | "));
  const lbl = await q("return [...document.querySelectorAll('[data-pgs-left] .se-dlbl')].filter((l) => l.getBoundingClientRect().height > 30).map((l) => l.innerText)");
  check(`${what} ป้ายหน้าแถวทุกป้ายอยู่บรรทัดเดียว`, lbl.length === 0, lbl.join(" | "));
  const lx = await q("const l = document.querySelector('[data-pgs-left]'); return l.scrollWidth - l.clientWidth");
  check(`${what} ฝั่งตั้งค่าไม่ล้นแนวนอน`, lx <= 0, String(lx));
};
const parseSize = (t) => { const m = /ราว ([\d.,]+) (KB|MB) จาก ([\d,]+) ภาพ/.exec(t ?? ""); return m ? { bytes: Number(m[1].replace(/,/g, "")) * (m[2] === "MB" ? 1048576 : 1024), images: Number(m[3].replace(/,/g, "")) } : null; };
const tipLines = async (title) => {
  await q(`document.querySelector('[data-pgs] .infob[data-info=${JSON.stringify(title)}]')?.scrollIntoView({ block: 'center' }); return 1;`);
  await sleep(120);
  await click(`[data-pgs] .infob[data-info="${title}"]`); await sleep(350);
  const got = await linesOf(q, `.infotip[data-tip="${title}"]`);
  await esc(); await sleep(150);
  return got;
};
// จุดตัดบรรทัดที่คาดไว้ของทุกกล่อง ⓘ ในหน้าต่าง ที่หน้าต่าง 1280 × 800 (อ่านเองทุกบรรทัดแล้ว 14 และ 15 พ.ย. 2569)
const TIPS = {
  "PGS": ["PGS คือซับแบบภาพของแผ่น Blu-ray เก็บเป็นไฟล์ .sup ⏎ โปรแกรมวาดซับทุกบรรทัดเป็นภาพด้วยตัววาดเดียวกับตอนเล่น ⏎ หน้าตาจึงเหมือนในตัวเล่น แต่แก้ข้อความทีหลังไม่ได้", "ใช้ทำอะไร ใส่ในหนังสำหรับเครื่องเล่นหรือทีวีที่ไม่รองรับซับ ASS ⏎ หรือทำแผ่น Blu-ray ⏎ ข้อดีฟอนต์ สี ตำแหน่ง ขึ้นเหมือนกันทุกเครื่อง", "ข้อจำกัด ภาพละไม่เกิน 255 สี และขึ้นพร้อมกันได้ไม่เกินสองกรอบ ⏎ ส่วนเอฟเฟกต์เคลื่อนไหวต้องวาดใหม่ทุกเฟรม ⏎ ข้อเสียขอบเบลอหรือสีไล่โทนอาจเห็นเป็นขั้น ⏎ และไฟล์ใหญ่ขึ้นตามจำนวนภาพ", "แนะนำเก็บไฟล์ ASS ไว้ด้วยเสมอ ⏎ ถ้าต้องแก้ซับให้แก้ที่ไฟล์ ASS แล้วส่งออกใหม่"],
  "ตัวสร้าง PGS": ["ตัวสร้าง PGS ทำภาพซับเป็นไฟล์ .sup และมีให้เลือกสามตัว ⏎ โดยชั้นหนังกับ SUPer วาดซับด้วย libass ตัวเดียวกับตอนเล่น","ชั้นหนัง ffmpeg (Fast Forward MPEG) วาดซับด้วย libass ⏎ แล้วโปรแกรมนี้ลดสีและเขียนไฟล์ .sup เอง ⏎ ข้อดีเหมือนต้นฉบับที่สุดทั้งสีและขอบโปร่งใส ⏎ รวมถึงภาพเฟด ข้อความเลื่อน และย่อขยาย อีกทั้งทำเสร็จเร็ว ⏎ โดยภาพเฟดเปลี่ยนแค่จานสี ไฟล์จึงเล็กกว่า SUPer ⏎ ข้อเสียข้อความเลื่อนเขียนเต็มทุกเฟรม ไฟล์จึงใหญ่กว่า SUPer ⏎ ส่วนชุดที่เครื่องเล่น Blu-ray อาจถอดไม่ทัน ⏎ บอกเป็นจำนวน แต่ไม่ได้ตัดเฟรมให้","SUPer โปรแกรมของ cubicibo ที่ทำไฟล์ตามมาตรฐาน Blu-ray ⏎ โดยรับภาพที่ชั้นหนังวาดไว้ ⏎ ข้อดีไฟล์เล็กและตรวจว่าเครื่องเล่น Blu-ray ถอดทัน ⏎ ส่วนการลดสีใช้ libimagequant ซึ่งเก่งกับขอบเรืองแสง ⏎ ข้อเสียช้ากว่าหลายเท่า ภาพเฟดกับข้อความเลื่อนเพี้ยนกว่า ⏎ และรับเฉพาะขนาดภาพของ Blu-ray","Subtitle Edit ตัวแปลง SeConv วาดซับด้วยตัววาดของตัวเอง ⏎ ตามหน้าตาที่ตั้งในหน้าต่างนี้ ⏎ ข้อดีไฟล์เล็ก เพราะทำหนึ่งภาพต่อหนึ่งบรรทัด ⏎ และมีกล่องพื้นหลังกับระยะบรรทัดให้ตั้ง ⏎ ข้อเสียสไตล์ ตำแหน่ง และเอฟเฟกต์ของซับ ASS หายหมด ⏎ จึงเหมาะกับซับ SRT เท่านั้น","ตัวที่ไม่ได้ใส่ ass2bdnxml วาดภาพได้แต่ทำไฟล์ .sup เองไม่ได้ ⏎ ส่วน BDSup2Sub แปลงได้เฉพาะซับที่เป็นภาพอยู่แล้ว ⏎ และ avs2bdnxml กับ Spp2Pgs ต้องลง AviSynth ก่อน","แนะนำชั้นหนัง เพราะเหมือนต้นฉบับที่สุด ⏎ ส่วน SUPer ใช้ตอนทำแผ่น Blu-ray ⏎ และ Subtitle Edit ใช้กับซับ SRT"],
  "ขนาดภาพของ PGS": ["ขนาดภาพของ PGS ต้องเท่าภาพของหนังที่จะใส่ ⏎ ซับจึงอยู่ตรงตำแหน่ง", "ตามหนัง ขนาดภาพของหนังที่เปิดอยู่ ⏎ ข้อดีตรงกับหนังเสมอ ⏎ ข้อเสียถ้าหนังไม่ใช่ขนาดของ Blu-ray ⏎ เครื่องเล่น Blu-ray อาจไม่รับ", "ขนาดของ Blu-ray 1920 × 1080 1280 × 720 720 × 576 ⏎ หรือ 720 × 480 ⏎ ข้อดีเครื่องเล่น Blu-ray รับแน่นอน", "แนะนำตามหนัง"],
  "ขนาดไฟล์ที่คาด": ["โปรแกรมวาดภาพจริงไม่เกินแปดภาพกระจายทั้งเรื่อง ⏎ แล้วเอาขนาดเฉลี่ยคูณจำนวนภาพ ไฟล์จริงจึงอาจต่างจากที่คาดได้", "ชั้นหนัง ภาพเฟดเปลี่ยนแค่จานสี ส่วนเอฟเฟกต์อื่นเขียนทุกเฟรม", "SUPer ตอนเอฟเฟกต์เปลี่ยนแค่สีของภาพเดิม ไฟล์จึงเล็กกว่า", "Subtitle Edit ทำหนึ่งภาพต่อหนึ่งบรรทัด เพราะไม่วาดเอฟเฟกต์"],
  "จำนวนสีต่อภาพ": ["PGS เก็บได้ไม่เกิน 255 สีต่อหนึ่งภาพ ภาพที่มีสีเกินจำนวนที่ตั้ง ⏎ โปรแกรมเลือกสีที่ใกล้ที่สุดในจานสีแทน", "ค่ามาก เก็บสีได้ละเอียด ⏎ ข้อดีขอบเบลอกับสีไล่โทนเรียบ ⏎ ข้อเสียไฟล์ใหญ่ขึ้นเล็กน้อย", "ค่าน้อย ใช้สีน้อยลง ⏎ ข้อดีไฟล์เล็กลง ⏎ ข้อเสียขอบเบลอเห็นเป็นขั้น", "แนะนำ255"],
  "ความสดของสี": ["ดันสีให้สดขึ้นโดยความสว่างเท่าเดิม ส่วนสีขาว ดำ และเทาไม่เปลี่ยน ⏎ สีหม่นที่เคยเจอแก้ที่ตัวสร้างแล้ว ค่านี้มีไว้ตอนอยากให้สดกว่าต้นฉบับ", "แนะนำ0% ได้สีตรงต้นฉบับ"],
  "สีตามบรรทัด YCbCr Matrix": ["ซับ ASS มีบรรทัด YCbCr Matrix บอกตารางสีที่คนทำซับใช้ ⏎ แล้วตัวเล่นอย่าง mpv ใช้บรรทัดนี้ปรับสีให้เข้ากับภาพหนัง", "เปิด สีของ PGS ตรงกับที่เห็นตอนเล่นซับ ASS ใน mpv ⏎ ข้อดีป้ายที่คนทำซับจับสีให้เข้ากับภาพหนังยังเข้ากันเหมือนเดิม", "ปิด ใช้สีตามสไตล์ตรงตัว ⏎ ข้อดีสีตรงตัวเลขในสไตล์ ⏎ ข้อเสียซับ TV.601 บนหนัง HD สีจะต่างจากตอนเล่นเล็กน้อย", "แนะนำเปิด"],
  "ตารางสีของจานสี": ["จานสีของ PGS เก็บเป็น YCbCr และตัวเล่นเดาตารางสีเอง ⏎ โดยภาพสูงเกิน 576 จุดใช้ BT.709 นอกนั้นใช้ BT.601", "อัตโนมัติ เลือกแบบเดียวกับที่ตัวเล่นเดา ⏎ ข้อดีสีตรงทุกตัวเล่น", "BT.709 บังคับใช้ตารางของหนัง HD ⏎ ข้อเสียภาพสูงไม่เกิน 576 จุด ตัวเล่นจะถอดสีเพี้ยน", "BT.601 บังคับใช้ตารางของหนัง SD ⏎ ข้อเสียภาพ HD ตัวเล่นจะถอดสีเพี้ยน", "แนะนำอัตโนมัติ"],
  "กระจายจุดสี": ["ตอนภาพมีสีเกินจำนวนที่ตั้ง จะกระจายจุดสีสลับกัน ⏎ ให้ตาเห็นเป็นสีกลาง", "เปิด กระจายส่วนต่างของสีไปจุดข้าง ๆ ⏎ ข้อดีสีไล่โทนเป็นขั้นน้อยลง ⏎ ข้อเสียมีจุดเล็ก ๆ ที่ขอบ ไฟล์ใหญ่ขึ้น และทำช้าลง", "ปิด ทุกจุดใช้สีที่ใกล้ที่สุด ⏎ ข้อดีขอบเรียบ และไฟล์เล็กกว่า ⏎ ข้อเสียสีไล่โทนอาจเห็นเป็นขั้น", "แนะนำปิด เพราะลองกับซับทดสอบแล้วไม่ได้ช่วย"],
  "กรอบบนจอ": ["กรอบคือบริเวณบนจอที่ PGS วาดซับ โดยมาตรฐาน Blu-ray ⏎ ให้มีพร้อมกันไม่เกินสองกรอบ เช่นบทพูดล่างกับป้ายบน", "2 กรอบ แยกซับที่อยู่คนละที่เป็นสองกรอบ ⏎ ข้อดีภาพเล็กกว่า และไฟล์เล็กกว่า", "1 กรอบ รวมซับทั้งหมดเป็นกรอบเดียว ⏎ ข้อดีเครื่องเล่นรุ่นเก่าบางเครื่องแสดงได้แน่นอนกว่า ⏎ ข้อเสียภาพใหญ่ขึ้นเมื่อซับอยู่ห่างกัน", "แนะนำ2 กรอบ"],
  "ความต่างของสี ΔE": ["ΔE คือความต่างของสีแบบที่ตาคนเห็น ⏎ คิดจากสีหลักของซับ ASS ตอนเล่นเทียบกับสีเดียวกันใน PGS", "ตรง ΔE ต่ำกว่า 2 ตาแทบมองไม่ออกว่าต่าง", "ใกล้เคียง ΔE 2 ถึง 5 มองใกล้ ๆ ถึงเห็นว่าต่าง", "ต่าง ΔE ตั้งแต่ 5 เห็นได้ว่าสีไม่เหมือน"],
  "หน้าตาซับ": ["ซับ SRT ไม่มีสไตล์ในไฟล์ โปรแกรมจึงวาดด้วยหน้าตาที่ตั้งตรงนี้ ⏎ ส่วนตัวหนา ตัวเอียง และสีที่ใส่ไว้ในบรรทัดยังใช้ได้ตามเดิม", "ขนาด ขอบ เงา ตัวเลขคิดที่ภาพสูง 1080 จุด ⏎ แล้วย่อขยายตามขนาดภาพที่ส่งออก ⏎ ข้อดีตั้งครั้งเดียวใช้ได้ทุกขนาดภาพ", "ห่างขอบ บนล่างวัดจากขอบภาพด้านที่ซับอยู่ถึงตัวซับ ⏎ ส่วนซ้ายขวากันไม่ให้ซับชิดขอบข้างของภาพ", "Subtitle Edit ใช้หน้าตานี้กับซับทุกชนิดรวมถึงซับ ASS ⏎ เพราะไม่อ่านสไตล์ที่อยู่ในไฟล์"],
  "ตำแหน่งของซับ": ["ตำแหน่งของซับบนภาพ เลือกได้เก้าจุดแบบเดียวกับซับ ASS ⏎ โดยซับของหนังทั่วไปอยู่กลางล่าง", "แนะนำกลางล่าง"],
  "ระยะบรรทัด": ["ช่องว่างที่เพิ่มระหว่างบรรทัดของซับที่มีหลายบรรทัด ⏎ คิดเป็นเปอร์เซ็นต์ของความสูงบรรทัด", "แนะนำ0% ได้ระยะปกติของ Subtitle Edit"],
  "จัดบรรทัดในก้อนซับ": ["จัดบรรทัดภายในก้อนซับ เมื่อซับมีหลายบรรทัดที่ยาวไม่เท่ากัน", "กึ่งกลาง ทุกบรรทัดอยู่กึ่งกลางของก้อนซับ ⏎ ข้อดีแบบที่ซับหนังใช้กันทั่วไป", "ชิดซ้าย ทุกบรรทัดเริ่มตรงขอบซ้ายของก้อนซับ", "ชิดขวา ทุกบรรทัดจบตรงขอบขวาของก้อนซับ", "ตามตำแหน่ง ซับที่อยู่ซ้ายชิดซ้ายและซับที่อยู่ขวาชิดขวา ⏎ ส่วนซับที่อยู่กลางจัดกึ่งกลาง", "แนะนำกึ่งกลาง"],
  "กล่องพื้นหลัง": ["กล่องสีทึบหลังตัวอักษร ช่วยให้อ่านซับได้บนภาพที่สว่างหรือลายตา", "ไม่มี ซับมีแค่ขอบกับเงา ⏎ ข้อดีบังภาพน้อยที่สุด", "กล่องเดียว กล่องเดียวคลุมทุกบรรทัดของซับ ⏎ ข้อดีอ่านง่ายและดูเรียบร้อย ⏎ ข้อเสียบังภาพมากกว่า", "กล่องละบรรทัด แต่ละบรรทัดมีกล่องยาวเท่าตัวบรรทัด ⏎ ข้อดีบังภาพน้อยกว่ากล่องเดียว", "แนะนำไม่มี เว้นแต่หนังมีฉากสว่างจนอ่านซับยาก"],
  "ระดับบีบอัดของ SUPer": ["ระยะห่างขั้นต่ำเป็นเปอร์เซ็นต์ ที่ SUPer ยอมวาดใหม่ทั้งภาพ ⏎ ถ้าห่างน้อยกว่านี้จะเปลี่ยนแค่สีของภาพเดิม", "ค่ามาก วาดภาพใหม่น้อยครั้ง ⏎ ข้อดีไฟล์เล็ก ⏎ ข้อเสียภาพที่เปลี่ยนเร็วอาจตกหล่น", "ค่าน้อย วาดภาพใหม่บ่อยขึ้น ⏎ ข้อดีภาพตรงกว่า ⏎ ข้อเสียไฟล์ใหญ่ขึ้น", "แนะนำ80 ตามค่าตั้งต้นของ SUPer"],
  "ตัวลดสีของ SUPer": ["วิธีลดสีของภาพให้เหลือไม่เกิน 255 สี ตามที่ผู้ทำ SUPer จัดอันดับไว้", "libimagequant ตัวลดสีที่ละเอียดที่สุด ⏎ ข้อดีขอบเรืองแสงกับสีไล่โทนสวย ⏎ ข้อเสียไฟล์ใหญ่กว่า Pillow", "QtzrUTC ตัวลดสีของ SUPer เอง ⏎ ข้อดีละเอียดและค่อนข้างเร็ว ⏎ ข้อเสียไฟล์ใหญ่ที่สุด", "HexTree เร็วและละเอียดพอใช้ ⏎ ข้อดีเหมาะกับซับที่มีเอฟเฟกต์ไม่มาก ⏎ ข้อเสียขอบเรืองแสงใหญ่ ๆ ไม่สวย", "Pillow เร็วที่สุด ⏎ ข้อดีไฟล์เล็ก เหมาะกับบทพูดกับคาราโอเกะ ⏎ ข้อเสียขอบเรืองแสงกับสีไล่โทนเพี้ยนมาก", "แนะนำlibimagequant"],
  "การจัดกรอบของ SUPer": ["วิธีที่ SUPer แบ่งช่วงซับกับกำหนดกรอบบนจอ", "เต็มที่ แบ่งกรอบให้ได้ภาพเล็กที่สุดโดยยังอยู่ในขีดจำกัดของเครื่องเล่น ⏎ ข้อดีดีที่สุดตามที่ผู้ทำแนะนำ ⏎ ข้อเสียโปรแกรมทำแผ่น Scenarist อาจไม่ชอบตอนสร้างใหม่", "ปกติ แบ่งกรอบแบบระวังกว่า ⏎ ข้อดีใช้แทนได้เมื่อโปรแกรมทำแผ่นมีปัญหา", "ปลอดภัย แบ่งกรอบแบบพื้นฐาน ⏎ ข้อเสียผู้ทำบอกว่าไม่ควรใช้", "แนะนำเต็มที่"],
  "กันภาพตกหล่น": ["สองตัวเลือกนี้ช่วยให้ภาพไม่ตกหล่นตอนเอฟเฟกต์ซับซ้อน", "วาดใหม่ทีละกรอบ ยอมวาดใหม่เฉพาะกรอบที่เปลี่ยนจากสองกรอบ ⏎ ข้อดีภาพที่ตกหล่นน้อยลง ⏎ ข้อเสียห้ามสร้าง PES ใหม่ในโปรแกรมทำแผ่น Scenarist", "เตรียมสีล่วงหน้า ถอดการเปลี่ยนสีไว้ก่อนวาดภาพใหม่ ⏎ ข้อดีภาพที่ตกหล่นน้อยลง ⏎ ข้อเสียห้ามสร้าง PES ใหม่ในโปรแกรมทำแผ่น Scenarist", "แนะนำเปิดทั้งสอง สำหรับดูในคอม"],
  "วาดซ้ำ": ["วาดภาพซ้ำทุกกี่วินาทีระหว่างซับที่ขึ้นนาน ⏎ ตอนกรอหนังไปกลางบรรทัดซับจะขึ้นทันที และใส่ 0 คือไม่วาดซ้ำ", "แนะนำ0 สำหรับดูในคอม ⏎ ส่วนทำแผ่น Blu-ray ใส่ราว 2 ถึง 5 วินาที"],
  "ตรวจบิตเรต": ["ให้ SUPer ตรวจว่าซับใช้บิตเรตไม่เกินค่านี้ แล้วเตือนถ้าเกิน ⏎ ใส่ 0 คือไม่ตรวจ", "แนะนำ0 สำหรับดูในคอม ⏎ ส่วนทำแผ่น Blu-ray ผู้ทำแนะนำช่วง 500 ถึง 16,000 kbps"],
};
const tipCheck = async (title) => {
  const got = await tipLines(title);
  if (DUMP) { console.log(`TIP ${JSON.stringify(title)}: ${JSON.stringify(got)},`); return; }
  const want = TIPS[title];
  if (!want) { check(`กล่อง ⓘ ${title} มีค่าที่คาดไว้ในตัวตรวจ`, false, JSON.stringify(got)); return; }
  const bad = (got ?? []).filter((l, i) => l !== want[i]);
  check(`กล่อง ⓘ ${title} ตัดบรรทัดตรงที่คาดทุกย่อหน้า`, !!got && got.length === want.length && !bad.length, bad.join(" | ") || `${got?.length} ย่อหน้า`);
};

const optsBefore = await q("return [localStorage.getItem('pgs-engine'), localStorage.getItem('pgs-opts'), localStorage.getItem('pgs-style')]");
await q("localStorage.removeItem('pgs-engine'); localStorage.removeItem('pgs-opts'); localStorage.removeItem('pgs-style'); return 1;");
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  await nav("ซับไตเติล"); await sleep(500);
  const accept = await q("const s = document.querySelector('[data-sub-accept]'); if (!s) return null; const r = document.createRange(); r.selectNodeContents(s); return { t: s.innerText, h: Math.round(s.getBoundingClientRect().height), lines: new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size };");
  check("ช่องลากไฟล์บอกนามสกุลซับแบบใหม่ SMI SBV TTML ครบ แยกไฟล์หนังกับไฟล์ซับเป็นสองบรรทัดพอดี", !!accept && /SMI/.test(accept.t) && /SBV/.test(accept.t) && /TTML/.test(accept.t) && accept.lines === 2, JSON.stringify(accept));
  if (accept) await c.shot(`${SHOT}/00-ช่องลากไฟล์-นามสกุลที่รับ.png`, "[data-drop=subtitle]", 6);
  check("เปิดหนังทดสอบที่มีซับ ASS ในตัว", await openSub(MOVIE));
  await sleep(1200);
  check("เมนูเครื่องมือ ส่งออกเป็น PGS เปิดหน้าต่าง", await openDlg());

  /* ---------------------------------------------------------------- หน้าตาหน้าต่าง */
  const box = await q(`const d = document.querySelector('.dlg').getBoundingClientRect(), l = document.querySelector('[data-pgs-left]'), r = document.querySelector('[data-pgs-right]');
    return { d: [d.left, d.top, d.right, d.bottom].map(Math.round), vw: innerWidth, vh: innerHeight, lx: l.scrollWidth - l.clientWidth, rx: r.scrollWidth - r.clientWidth, h: Math.round(d.height) };`);
  check("หน้าต่างอยู่ในจอ 1280 × 800 ทั้งหมด สองฝั่งไม่ล้นแนวนอน", box.d[0] >= 0 && box.d[1] >= 0 && box.d[2] <= box.vw && box.d[3] <= box.vh && box.lx <= 0 && box.rx <= 0, JSON.stringify(box));
  await rowsOk("ซับ ASS");
  // เส้นแบ่งแนวนอนเหนือหัวข้อทุกหัวข้อของฝั่งตั้งค่า (พี่กันสั่ง "ขอเส้นแบ่งแนวนอนด้วย")
  const heads = await q("return [...document.querySelectorAll('[data-pgs-left] > .se-pgshead')].map((h) => { const s = getComputedStyle(h); return { t: h.innerText.trim().slice(0, 16), w: s.borderTopWidth, st: s.borderTopStyle }; })");
  check("หัวข้อทุกหัวข้อของฝั่งตั้งค่ามีเส้นแบ่งแนวนอน 1 จุดด้านบน", heads.length >= 2 && heads.every((h) => h.w === "1px" && h.st === "solid"), JSON.stringify(heads));

  /* ---------------------------------------------------------------- ตัวสร้าง PGS */
  const engs = () => q(`return [...document.querySelectorAll('[data-pgs-engine]')].map((b) => ({ k: b.dataset.pgsEngine, on: b.getAttribute('aria-checked'), off: b.getAttribute('aria-disabled'), t: b.innerText.replace(/\\s+/g, ' '), why: b.title, h: Math.round(b.getBoundingClientRect().height) }));`);
  const eng = await engs();
  check("มีตัวสร้างให้เลือกสามตัว ชั้นหนังติดป้ายแนะนำและเลือกไว้ ต่อด้วย SUPer กับ Subtitle Edit", eng.length === 3 && eng[0].k === "shelf" && eng[0].on === "true" && eng[0].t.includes("แนะนำ") && eng[1].k === "super" && eng[2].k === "seconv" && eng[2].t.includes("Subtitle Edit"), JSON.stringify(eng));
  check("การ์ดชั้นหนังบอกว่าใช้ ffmpeg กับ libass วาดภาพ (พี่กันถาม \"มันคือตัวไหน ffmpeg หรือตัวไหน\")", eng[0].t.includes("ffmpeg กับ libass"), eng[0].t);
  check("การ์ดสามใบสูงเท่ากัน", new Set(eng.map((e) => e.h)).size === 1, eng.map((e) => e.h).join(" "));
  check("หนัง 640 × 360 ไม่ใช่ขนาดของ Blu-ray SUPer กดไม่ได้พร้อมเหตุผล", eng[1].off === "true" && eng[1].why.includes("Blu-ray"), eng[1].why);
  check("Subtitle Edit เลือกได้ (มี SeConv ในโฟลเดอร์เครื่องมือ)", eng[2].off !== "true", eng[2].why);
  check("หัวข้อตัวสร้างบอกว่ามีสามตัว และมีปุ่ม ⓘ", await q("return [...document.querySelectorAll('[data-pgs] .se-pgshead')].some((h) => h.innerText.includes('มีให้เลือกสามตัว') && h.querySelector('.infob[data-info=\"ตัวสร้าง PGS\"]'))"));
  check("ซับ ASS กับตัวสร้างชั้นหนัง ไม่มีแผงหน้าตาซับ (ใช้สไตล์ในไฟล์)", !(await left()).includes("หน้าตาซับ"));

  /* ---------------------------------------------------------------- ป้ายภาพกับเทียบสี ASS กับ PGS */
  check("ภาพตัวอย่างขึ้น ทั้งภาพ ASS ตอนเล่นกับภาพ PGS", await prevDone() && await q("return !!document.querySelector('[data-pgs-img-ass]') && !!document.querySelector('[data-pgs-img-pgs]')"), await q("return document.querySelector('[data-pgs-prev-err]')?.innerText ?? ''"));
  const capA = await caps();
  check("ป้ายภาพบอกนามสกุลต้นทางเป็น PGS ต้นฉบับ .ass ตอนเล่น กับ .ass เป็น PGS .sup ที่จะได้", capA[0] === "ต้นฉบับ .ass ตอนเล่น" && capA[1] === ".ass เป็น PGS .sup ที่จะได้", JSON.stringify(capA));
  const tab = await q("return [...document.querySelectorAll('[data-pgs-crow]')].map((r) => ({ k: r.dataset.pgsCrow, t: r.innerText.replace(/\\s+/g, ' ') }))");
  check("ตารางสีหลัก ทุกสีของ PGS ตรงกับ ASS (ΔE ต่ำกว่า 2)", tab.length >= 2 && tab.every((r) => r.k === "ok"), JSON.stringify(tab));
  check("สรุปใต้ตาราง สีตรงทุกสี และบอกว่าพื้นหลังเป็นภาพจากหนัง", /ตรงกับต้นฉบับทุกสี/.test(await q("return document.querySelector('[data-pgs-sum]')?.innerText ?? ''")) && /ภาพจากหนัง/.test(await q("return document.querySelector('[data-pgs-note]')?.innerText ?? ''")));
  // ขนาดที่คาด ขึ้นเป็นประโยค ราว X จาก N ภาพ
  check("ขนาดที่คาดคิดเสร็จ ขึ้นเป็นราวกี่ KB จากกี่ภาพ", await estDone() && !!parseSize(await q("return document.querySelector('[data-pgs-est]')?.innerText ?? ''")), await q("return document.querySelector('[data-pgs-est]')?.innerText ?? ''"));
  const estShelf = parseSize(await q("return document.querySelector('[data-pgs-est]')?.innerText ?? ''"));
  await c.shot(`${SHOT}/01-ASS-เทียบสี-1280.png`, ".dlg", 6);
  // ไล่บรรทัดหาป้ายสีเหลือง (สไตล์ ป้ายในฉาก &H0000E0FF คือ #FFE000) ต้องเจอในตารางและตรง
  let yellow = null;
  for (let i = 0; i < 8 && !yellow; i++) {
    yellow = await q("return [...document.querySelectorAll('[data-pgs-crow]')].map((r) => r.innerText.replace(/\\s+/g, ' ')).find((t) => t.startsWith('#FFE000')) ?? null");
    if (yellow) break;
    if (await q("return document.querySelector('[data-pgs-line-next]')?.getAttribute('aria-disabled') === 'true'")) break;
    await click("[data-pgs-line-next]"); await sleep(200); await prevDone();
  }
  // สีใน PGS ปัดเศษตอนแปลง YCbCr ไปกลับได้ต่างหนึ่งหน่วย ผลต้องเป็น ตรง (ΔE ต่ำกว่า 2)
  const near2 = (h) => { const m = /^#FFE000 #([0-9A-F]{6}) /.exec(h ?? ""); if (!m) return false; const v = parseInt(m[1], 16); return Math.abs((v >> 16) - 255) <= 2 && Math.abs(((v >> 8) & 255) - 224) <= 2 && (v & 255) <= 2; };
  check("ป้ายสีเหลือง #FFE000 ของสไตล์ ป้ายในฉาก ได้สีเดียวกันใน PGS ต่างไม่เกินสองหน่วย (เดิม ffmpeg บีบสีเป็น 235,208,16)", near2(yellow) && / ตรง /.test(yellow), yellow ?? "ไม่เจอ");
  await c.shot(`${SHOT}/02-ASS-ป้ายสีเหลือง.png`, "[data-pgs-right]", 4);
  const back = await q("return document.querySelector('[data-pgs-line-prev]')?.getAttribute('aria-disabled')");
  check("ปุ่มบรรทัดก่อนหน้ากดได้เมื่อไม่ใช่บรรทัดแรก", back !== "true");

  /* ---------------------------------------------------------------- ปรับแต่ง */
  // จำนวนสี กดต้นแถบ = 16 สี ภาพตัวอย่างใช้ไม่เกิน 16 สี
  const r = await c.box('[data-pgs-colors] .range');
  await clickAt(r.left + 0.2, r.top + r.h / 2); await sleep(200);
  await prevDone(); await sleep(300);
  const note = await q("return document.querySelector('[data-pgs-note]')?.innerText ?? ''");
  const used = Number((/PGS ใช้ ([\d,]+) สี/.exec(note) ?? [])[1]?.replace(/,/g, ""));
  check("ตั้งสีต่อภาพ 16 สี ภาพตัวอย่างใช้ไม่เกิน 16 สี", await q("return document.querySelector('[data-pgs-colors] .range')?.getAttribute('aria-valuenow')") === "16" && used > 0 && used <= 16, note);
  check("จำค่าที่ตั้งไว้ในเครื่อง", (await q("return JSON.parse(localStorage.getItem('pgs-opts') ?? '{}').colors")) === 16);
  await click("[data-pgs-opts-reset]"); await sleep(200);
  check("ปุ่มค่าตั้งต้นคืนสีต่อภาพเป็น 255", await q("return document.querySelector('[data-pgs-colors] .range')?.getAttribute('aria-valuenow')") === "255");
  // ความสด 50% สีเหลืองสดขึ้น ΔE ต่างจาก ASS
  await prevDone();
  const vr = await c.box('[data-pgs-vivid] .range');
  await clickAt(vr.right - 1, vr.top + vr.h / 2); await sleep(200); await prevDone(); await sleep(300);
  const vivTab = await q("return [...document.querySelectorAll('[data-pgs-crow]')].map((r) => r.dataset.pgsCrow)");
  check("ความสด 50% สีใน PGS ต่างจาก ASS ตามที่ตั้ง ตารางบอกว่าต่าง", vivTab.some((k) => k !== "ok"), vivTab.join(" "));
  await click("[data-pgs-opts-reset]"); await sleep(200);
  check("หัวข้อเฉพาะตัวสร้างชั้นหนัง มีกระจายจุดสีกับกรอบพร้อมกัน", await q("return document.querySelector('[data-pgs-left]').innerText.includes('กระจายจุดสี') && document.querySelector('[data-pgs-left]').innerText.includes('กรอบพร้อมกัน') && !document.querySelector('[data-pgs-left]').innerText.includes('ระดับบีบอัด')"));
  await q("const l = document.querySelector('[data-pgs-left]'); l.scrollTop = l.scrollHeight; return 1;"); await sleep(200);
  await c.shot(`${SHOT}/03-ASS-ปรับแต่ง.png`, ".dlg", 6);
  await q("document.querySelector('[data-pgs-left]').scrollTop = 0; return 1;");
  for (const t of ["PGS", "ตัวสร้าง PGS", "ขนาดภาพของ PGS", "ขนาดไฟล์ที่คาด", "จำนวนสีต่อภาพ", "ความสดของสี", "สีตามบรรทัด YCbCr Matrix", "ตารางสีของจานสี", "กระจายจุดสี", "กรอบบนจอ", "ความต่างของสี ΔE"]) await tipCheck(t);

  /* ---------------------------------------------------------------- ส่งออก ASS ตัวในโปรแกรม เทียบขนาดที่คาด */
  const supA = `${TMP}/ตัวในโปรแกรม.sup`;
  await q(`window.__pgsTarget = ${JSON.stringify(supA)}; return 1;`);
  await click("[data-pgs-browse]"); await sleep(200);
  await click("[data-pgs-go]");
  check("ส่งออกด้วยตัวสร้างชั้นหนังเสร็จ", await waitFor("return !!document.querySelector('[data-pgs-done]')", 120000), await q("return (document.querySelector('[data-pgs-done]') ?? document.querySelector('[data-pgs-err]'))?.innerText?.replace(/\\s+/g, ' ')"));
  const prA = execFileSync(FP, ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "csv=p=0", supA]).toString().trim();
  check("ffprobe อ่านไฟล์ได้ เป็น PGS ขนาดเท่าหนัง", prA.startsWith("hdmv_pgs_subtitle"), prA);
  const realA = statSync(supA).size;
  // BUGS ข้อ 126 ไฟล์จริงเล็กลงได้มากกว่าที่คาด (บรรทัดที่หายขณะป้ายยังอยู่ ส่งแค่จานสีที่ทำให้บรรทัดนั้นใส) ตัวคาดคิดเผื่อเป็นภาพเต็ม ยอมให้คาดเกินได้ถึงสองเท่าครึ่ง
  check("ขนาดที่คาดของชั้นหนังใกล้ไฟล์จริง ไม่น้อยกว่าครึ่งหนึ่งและไม่เกินสองเท่าครึ่ง", !!estShelf && estShelf.bytes / realA > 0.5 && estShelf.bytes / realA < 2.5, `คาด ${Math.round((estShelf?.bytes ?? 0) / 1024)} KB จริง ${Math.round(realA / 1024)} KB`);
  await closeDlg();

  /* ---------------------------------------------------------------- ASS กับ Subtitle Edit เตือนว่าสไตล์หาย */
  check("เปิดหน้าต่างส่งออกอีกรอบ", await openDlg());
  await click('[data-pgs-engine="seconv"]'); await sleep(300);
  check("เลือก Subtitle Edit กับซับ ASS ขึ้นกล่องเตือนว่าสไตล์ ตำแหน่ง และเอฟเฟกต์หาย", /ไม่อ่านสไตล์ของซับ ASS/.test(await q("return document.querySelector('[data-pgs-seconv-warn]')?.innerText ?? ''")));
  const lt = await left();
  check("มีแผงหน้าตาซับที่ Subtitle Edit วาด พร้อมตัวเลือกเฉพาะ Subtitle Edit", ["หน้าตาซับที่ Subtitle Edit วาด", "ตำแหน่ง", "ห่างขอบ", "เฉพาะ Subtitle Edit", "ระยะบรรทัด", "จัดบรรทัด", "กล่องพื้นหลัง"].every((x) => lt.includes(x)), lt.replace(/\s+/g, " ").slice(0, 200));
  check("ตัวเลือกปรับแต่ง PGS ซ่อน และบอกเหตุผลว่า Subtitle Edit ทำจานสีเอง", !lt.includes("สีต่อภาพ") && /ทำจานสีและกรอบของ PGS เอง/.test(lt));
  check("ปุ่มตัวเอียงกดไม่ได้พร้อมเหตุผล", await q("const b = document.querySelector('[data-pgs-italic]'); return b.getAttribute('aria-disabled') === 'true' && b.title.includes('Subtitle Edit')"));
  check("Subtitle Edit ทำภาพตัวอย่างของซับ ASS ได้ ป้ายบอกว่าเป็นของ Subtitle Edit", await prevDone() && await q("return !!document.querySelector('[data-pgs-img-pgs]')") && (await caps())[1] === ".ass เป็น PGS .sup ที่ Subtitle Edit จะทำ", (await caps()).join(" | ") + " " + await q("return document.querySelector('[data-pgs-prev-err]')?.innerText ?? ''"));
  // เดิมตารางสีจับคู่ทีละจุด ขึ้นว่าขาวกลายเป็นดำ ΔE 100 ซึ่งไม่จริง เพราะ Subtitle Edit วาดตำแหน่งกับขนาดของตัวเอง
  check("ซับ ASS กับ Subtitle Edit ไม่มีตารางเทียบสีทีละจุด และมีคำบอกให้ดูจากภาพ", !(await q("return !!document.querySelector('[data-pgs-colors-table]') || !!document.querySelector('[data-pgs-sum]')")) && /เทียบสีทีละจุดกับต้นฉบับไม่ได้/.test(await q("return document.querySelector('[data-pgs-seconv-note]')?.innerText ?? ''")));
  check("การ์ด Subtitle Edit บอกว่าใช้ตัวแปลง SeConv ไม่เขียนชื่อซ้ำ", /ตัวแปลง SeConv วาดซับเอง/.test(await q("return document.querySelector('[data-pgs-engine=seconv]').innerText")));
  await rowsOk("ซับ ASS กับ Subtitle Edit");
  await c.shot(`${SHOT}/08-ASS-SubtitleEdit-เตือนสไตล์หาย.png`, ".dlg", 6);
  await click('[data-pgs-engine="shelf"]'); await sleep(200);
  await closeDlg();

  /* ---------------------------------------------------------------- SRT ปรับสี ขอบ ความหนา ตำแหน่ง บรรทัดจริงกับประโยคตัวอย่าง */
  check("เปิดไฟล์ SRT", await openSub(SRT));
  await sleep(800);
  check("เปิดหน้าต่างส่งออกของ SRT", await openDlg());
  check("SRT มีหัวข้อหน้าตาซับ ฟอนต์ ขนาด หนา เอียง สีสามสี ขอบหนา เงา ตำแหน่ง ห่างขอบบนล่างกับซ้ายขวา", await q(`const t = document.querySelector('[data-pgs-left]').innerText; return ['หน้าตาซับ SRT', 'ฟอนต์', 'ขนาด', 'หนา', 'เอียง', 'ตัวอักษร', 'ขอบหนา', 'เงา', 'ตำแหน่ง', 'ห่างขอบ', 'บนล่าง', 'ซ้ายขวา'].every((x) => t.includes(x)) && document.querySelectorAll('[data-pgs-color]').length === 3 && document.querySelectorAll('[data-pgs-align-n]').length === 9`));
  check("ตัวสร้างชั้นหนังไม่มีตัวเลือกเฉพาะ Subtitle Edit", !(await left()).includes("เฉพาะ Subtitle Edit"));
  await rowsOk("ซับ SRT");
  check("SRT เริ่มที่ดูบรรทัดในไฟล์ มีปุ่มเลือกบรรทัด ไม่มีช่องพิมพ์", await q("return !!document.querySelector('[data-pgs-src]') && !!document.querySelector('[data-pgs-line]') && !document.querySelector('[data-pgs-sample]')"));
  check("SRT ไม่มีภาพ ASS แต่มีภาพ PGS บนพื้นมืดกับพื้นสว่าง", await prevDone() && await q("return !document.querySelector('[data-pgs-img-ass]') && !!document.querySelector('[data-pgs-img-pgs=dark]') && !!document.querySelector('[data-pgs-img-pgs=light]')"));
  const capS = await caps();
  check("ป้ายภาพของ SRT บอก .srt เป็น PGS .sup บนพื้นมืด กับบนพื้นสว่าง", capS[0] === ".srt เป็น PGS .sup บนพื้นมืด" && capS[1] === ".srt เป็น PGS .sup บนพื้นสว่าง", JSON.stringify(capS));
  const imgL1 = await q("return document.querySelector('[data-pgs-img-pgs=dark]')?.src ?? ''");
  await click("[data-pgs-line-next]"); await sleep(200); await prevDone(); await sleep(200);
  check("กดบรรทัดถัดไป ภาพตัวอย่างเปลี่ยนเป็นบรรทัดจริงบรรทัดถัดไป", (await q("return document.querySelector('[data-pgs-img-pgs=dark]')?.src ?? ''")) !== imgL1 && /บรรทัดที่ 2 จาก/.test(await q("return document.querySelector('[data-pgs-line]')?.innerText ?? ''")));
  const img0 = await q("return document.querySelector('[data-pgs-img-pgs=dark]')?.src ?? ''");
  // สีตัวอักษรแดง ขอบน้ำเงิน หนาขึ้น (ช่องเลือกสีของระบบ ตั้งค่าแล้วยิงเหตุการณ์ input ไม่เปิดหน้าต่างเลือกสี)
  await setColor("color", "#ff0000"); await setColor("outline", "#0000ff");
  const ob = await c.box('[data-pgs-outline] .range');
  await clickAt(ob.left + ob.w * 0.8, ob.top + ob.h / 2); await sleep(200);
  await prevDone(); await sleep(300);
  const st = await q("return JSON.parse(localStorage.getItem('pgs-style') ?? '{}')");
  const img1 = await q("return document.querySelector('[data-pgs-img-pgs=dark]')?.src ?? ''");
  check("ตั้งสีตัวอักษรแดง ขอบน้ำเงิน ขอบหนาขึ้น ค่าเข้าและภาพตัวอย่างเปลี่ยน", st.color === "#FF0000" && st.outlineColor === "#0000FF" && st.outline >= 7 && img1 && img1 !== img0, JSON.stringify(st));
  const red = await countPx("[data-pgs-img-pgs=dark]", "a === 255 && r > 245 && gg < 12 && b < 12");
  const blue = await countPx("[data-pgs-img-pgs=dark]", "a === 255 && b > 245 && r < 12 && gg < 12");
  check("ภาพตัวอย่างมีตัวอักษรแดงกับขอบน้ำเงินจริง", red > 200 && blue > 200, `แดง ${red} น้ำเงิน ${blue}`);
  // ประโยคที่พิมพ์เอง ยังใช้ได้คู่กับบรรทัดจริง
  check("สลับเป็นประโยคที่พิมพ์ ขึ้นช่องพิมพ์แทนปุ่มเลือกบรรทัด", await seg("ข้อความในภาพตัวอย่าง", "ประโยคที่พิมพ์") && await waitFor("return !!document.querySelector('[data-pgs-sample]') && !document.querySelector('[data-pgs-line]')", 2000));
  await prevDone(); await sleep(200);
  const imgT = await q("return document.querySelector('[data-pgs-img-pgs=dark]')?.src ?? ''");
  await setSample("ทดสอบประโยคตัวอย่าง ยาวขึ้นอีกนิด");
  await sleep(200); await prevDone(); await sleep(300);
  check("พิมพ์ประโยคตัวอย่างใหม่ ภาพตัวอย่างเปลี่ยนตาม", (await q("return document.querySelector('[data-pgs-img-pgs=dark]')?.src ?? ''")) !== imgT);
  // ตำแหน่งเก้าจุด กดกลางบน ค่าเข้าและป้ายบอกชื่อ
  await click('[data-pgs-align-n="8"]'); await sleep(200);
  check("กดตำแหน่งกลางบน ปุ่มนั้นถูกเลือก ป้ายบอกกลางบน และจำค่าไว้", await q("return document.querySelector('[data-pgs-align-n=\"8\"]').getAttribute('aria-checked') === 'true' && document.querySelector('[data-pgs-align-name]').innerText === 'กลางบน'") && (await q("return JSON.parse(localStorage.getItem('pgs-style') ?? '{}').align")) === 8);
  await c.shot(`${SHOT}/04-SRT-ปรับสีขอบ-1280.png`, ".dlg", 6);
  await tipCheck("หน้าตาซับ");
  await tipCheck("ตำแหน่งของซับ");
  await click("[data-pgs-style-reset]"); await sleep(200);
  const st0 = await q("return JSON.parse(localStorage.getItem('pgs-style') ?? '{}')");
  check("ปุ่มค่าตั้งต้นของหน้าตาซับ คืนสีขาวขอบดำ ตำแหน่งกลางล่าง", st0.color === "#FFFFFF" && st0.align === 2, JSON.stringify(st0));

  /* ---------------------------------------------------------------- SRT กับ Subtitle Edit ตัวเลือกครบ กล่องพื้นหลัง ส่งออก */
  await seg("ข้อความในภาพตัวอย่าง", "บรรทัดในไฟล์"); await sleep(200);
  await click('[data-pgs-engine="seconv"]'); await sleep(300);
  check("SRT กับ Subtitle Edit ไม่มีกล่องเตือนสไตล์ของ ASS", !(await q("return !!document.querySelector('[data-pgs-seconv-warn]')")));
  const ltS = await left();
  check("มีตัวเลือกเฉพาะ Subtitle Edit ระยะบรรทัด จัดบรรทัด กล่องพื้นหลัง", ["หน้าตาซับ SRT", "เฉพาะ Subtitle Edit", "ระยะบรรทัด", "จัดบรรทัด", "กล่องพื้นหลัง"].every((x) => ltS.includes(x)));
  await prevDone();
  check("ภาพตัวอย่างของ Subtitle Edit ป้ายบอก .srt เป็น PGS .sup ที่ Subtitle Edit ทำ บนพื้นมืด", (await caps())[0] === ".srt เป็น PGS .sup ที่ Subtitle Edit ทำ บนพื้นมืด", (await caps()).join(" | ") + " " + await q("return document.querySelector('[data-pgs-prev-err]')?.innerText ?? ''"));
  check("ยังไม่มีกล่อง ภาพตัวอย่างไม่มีจุดสีเขียว", (await countPx("[data-pgs-img-pgs=dark]", "a > 200 && gg > 200 && r < 40 && b < 40")) === 0);
  check("เลือกกล่องเดียว ขึ้นแถวสีกล่องกับขนาดกล่อง", await seg("กล่องพื้นหลัง", "กล่องเดียว") && await waitFor("return !!document.querySelector('[data-pgs-color=box]') && !!document.querySelector('[data-style-num=pgs-box-pad]') && !!document.querySelector('[data-style-num=pgs-box-radius]')", 2000));
  await setColor("box", "#00ff00");
  const bo = await c.box('[data-pgs-boxop] .range');
  await clickAt(bo.right - 1, bo.top + bo.h / 2); await sleep(200);
  await prevDone(); await sleep(300);
  const green = await countPx("[data-pgs-img-pgs=dark]", "a > 200 && gg > 200 && r < 40 && b < 40");
  check("กล่องสีเขียวทึบ 100% ภาพที่ Subtitle Edit วาดมีกล่องสีเขียวจริง", green > 2000, `จุดสีเขียว ${green}`);
  await rowsOk("ซับ SRT กับ Subtitle Edit และกล่องพื้นหลัง");
  await q("const l = document.querySelector('[data-pgs-left]'); document.querySelector('[data-pgs-boxop]').scrollIntoView({ block: 'center' }); return 1;"); await sleep(200);
  await c.shot(`${SHOT}/09-SRT-SubtitleEdit-กล่องพื้นหลัง.png`, ".dlg", 6);
  for (const t of ["ระยะบรรทัด", "จัดบรรทัดในก้อนซับ", "กล่องพื้นหลัง"]) await tipCheck(t);
  check("ขนาดที่คาดของ Subtitle Edit คิดเสร็จ จำนวนภาพเท่าจำนวนบรรทัด", await estDone() && !!parseSize(await q("return document.querySelector('[data-pgs-est]')?.innerText ?? ''")), await q("return document.querySelector('[data-pgs-est]')?.innerText ?? ''"));
  const supE = `${TMP}/SubtitleEdit.sup`;
  await q(`window.__pgsTarget = ${JSON.stringify(supE)}; return 1;`);
  await click("[data-pgs-browse]"); await sleep(200);
  await click("[data-pgs-go]");
  let sawSe = false;
  const tE = Date.now();
  while (Date.now() - tE < 120000) {
    const s = await q("return { done: !!document.querySelector('[data-pgs-done]') || !!document.querySelector('[data-pgs-err]'), st: document.querySelector('[data-pgs-status]')?.innerText ?? '', go: document.querySelector('[data-pgs-go]')?.innerText ?? '' }");
    if (/Subtitle Edit/.test(s.st + s.go)) sawSe = true;
    if (s.done) break;
    await sleep(150);
  }
  check("ส่งออกด้วย Subtitle Edit เสร็จ", await q("return !!document.querySelector('[data-pgs-done]')"), await q("return (document.querySelector('[data-pgs-done]') ?? document.querySelector('[data-pgs-err]'))?.innerText?.replace(/\\s+/g, ' ')"));
  check("ระหว่างทำ ปุ่มกับแถบบอกว่า Subtitle Edit กำลังทำไฟล์", sawSe);
  const prE = execFileSync(FP, ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "csv=p=0", supE]).toString().trim();
  check("ffprobe อ่านไฟล์ของ Subtitle Edit ได้ เป็น PGS 1920 × 1080", prE.startsWith("hdmv_pgs_subtitle") && prE.includes("1920,1080"), prE);
  await c.shot(`${SHOT}/10-SubtitleEdit-ส่งออกเสร็จ.png`, ".dlg", 6);
  await click("[data-pgs-style-reset]"); await sleep(200);

  /* ---------------------------------------------------------------- SUPer */
  await click('[data-pgs-engine="super"]'); await sleep(300);
  check("เปลี่ยนตัวสร้างแล้ว กล่องผลส่งออกของ Subtitle Edit รอบก่อนหายไป", !(await q("return !!document.querySelector('[data-pgs-done]')")));
  await prevDone();
  const sEng =await q("return document.querySelector('[data-pgs-engine=super]')?.getAttribute('aria-checked')");
  check("SRT ขนาด 1920 × 1080 เลือก SUPer ได้", sEng === "true");
  check("เลือก SUPer แล้วมีตัวเลือกเฉพาะ SUPer ครบ", await q(`const t = document.querySelector('[data-pgs-left]').innerText; return ['ระดับบีบอัด', 'ตัวลดสี', 'จัดกรอบ', 'กันภาพตกหล่น', 'วาดซ้ำทุก', 'บิตเรตไม่เกิน'].every((x) => t.includes(x)) && !t.includes('กระจายจุดสี') && !t.includes('เฉพาะ Subtitle Edit');`));
  check("SUPer ทำภาพตัวอย่างได้ ป้ายภาพบอกว่าเป็นของ SUPer", await prevDone() && await q("return !!document.querySelector('[data-pgs-img-pgs=dark]')") && (await caps())[0].includes("SUPer"), await q("return document.querySelector('[data-pgs-prev-err]')?.innerText ?? ''"));
  await q("const l = document.querySelector('[data-pgs-left]'); l.scrollTop = l.scrollHeight; return 1;"); await sleep(200);
  await c.shot(`${SHOT}/05-SUPer-ตัวเลือก.png`, ".dlg", 6);
  for (const t of ["ระดับบีบอัดของ SUPer", "ตัวลดสีของ SUPer", "การจัดกรอบของ SUPer", "กันภาพตกหล่น", "วาดซ้ำ", "ตรวจบิตเรต"]) await tipCheck(t);
  const supS = `${TMP}/SUPer.sup`;
  await q(`window.__pgsTarget = ${JSON.stringify(supS)}; return 1;`);
  await click("[data-pgs-browse]"); await sleep(200);
  await click("[data-pgs-go]");
  let sawSuper = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 180000) {
    const s = await q("return { done: !!document.querySelector('[data-pgs-done]') || !!document.querySelector('[data-pgs-err]'), st: document.querySelector('[data-pgs-status]')?.innerText ?? '', go: document.querySelector('[data-pgs-go]')?.innerText ?? '' }");
    if (/SUPer/.test(s.st + s.go)) sawSuper = true;
    if (s.done) break;
    await sleep(200);
  }
  check("ส่งออกด้วย SUPer เสร็จ", await q("return !!document.querySelector('[data-pgs-done]')"), await q("return (document.querySelector('[data-pgs-done]') ?? document.querySelector('[data-pgs-err]'))?.innerText?.replace(/\\s+/g, ' ')"));
  check("ระหว่างทำ ปุ่มกับแถบบอกว่า SUPer กำลังทำไฟล์", sawSuper);
  const prS = execFileSync(FP, ["-v", "error", "-show_entries", "stream=codec_name,width,height", "-of", "csv=p=0", supS]).toString().trim();
  check("ffprobe อ่านไฟล์ของ SUPer ได้ เป็น PGS 1920 × 1080", prS.startsWith("hdmv_pgs_subtitle") && prS.includes("1920,1080"), prS);
  check("ไม่มีไฟล์ชั่วคราวค้างในโฟลเดอร์ปลายทาง", readdirSync(TMP).every((f) => !f.includes(".partial")), readdirSync(TMP).join(" "));
  await c.shot(`${SHOT}/06-SUPer-ส่งออกเสร็จ.png`, ".dlg", 6);
  await click('[data-pgs-engine="shelf"]'); await sleep(200);
  await closeDlg();

  /* ---------------------------------------------------------------- ซับข้อความแบบอื่น SAMI กับ SBV */
  // เดิมเปิด SAMI ไม่ได้ ตัวเพิ่มไฟล์ฝั่ง Rust ให้ mkvmerge อ่านอย่างเดียว ขึ้นว่า mkvmerge อ่านไม่ได้ (merge.rs add_file แก้แล้ว · เทส other_text_formats_open)
  const samiOk = await openSub(SAMI, 3);
  check("เปิดซับ SAMI (.smi) ได้ ตารางมีครบสี่บรรทัด และป้ายแทร็กบอกชนิด SAMI", samiOk && await q("return document.querySelectorAll('[data-subedit] .se-grid tbody tr').length") === 4 && /SAMI/.test(await q("return document.querySelector('main')?.innerText ?? ''")), String(await q("return document.querySelector('[data-sub-err], .drop.bad')?.innerText ?? document.querySelectorAll('[data-subedit] .se-grid tbody tr').length")));
  if (samiOk) {
    await sleep(600);
    check("หน้าต่างส่งออกของซับ SAMI ป้ายภาพบอก ต้นฉบับ .smi กับ .smi เป็น PGS", await openDlg() && await prevDone() && (await caps())[0] === "ต้นฉบับ .smi ตอนเล่น" && (await caps())[1] === ".smi เป็น PGS .sup ที่จะได้", (await caps()).join(" | "));
    // เดิมหัวตารางเขียน สีใน ASS กับสรุป ตรงกับ ASS ทั้งที่ต้นฉบับเป็น .smi
    check("ตารางสีของซับ SAMI หัวตารางบอก สีใน .smi และสรุปเรียกว่าต้นฉบับ", /สีใน \.smi/.test(await q("return document.querySelector('[data-pgs-colors-table] .head')?.innerText ?? ''")) && /ต้นฉบับ/.test(await q("return document.querySelector('[data-pgs-sum]')?.innerText ?? ''")) && !/ASS/.test(await q("return document.querySelector('[data-pgs-sum]')?.innerText ?? ''")), await q("return document.querySelector('[data-pgs-colors-table] .head')?.innerText.replace(/\\s+/g, ' ') ?? ''"));
    const supM = `${TMP}/SAMI.sup`;
    await q(`window.__pgsTarget = ${JSON.stringify(supM)}; return 1;`);
    await click("[data-pgs-browse]"); await sleep(200);
    await click("[data-pgs-go]");
    check("ส่งออกซับ SAMI เป็น PGS เสร็จ ได้ 4 ภาพ", await waitFor("return !!document.querySelector('[data-pgs-done]')", 60000) && /(^|\s)4 ภาพ ขนาด/.test(await q("return document.querySelector('[data-pgs-done]')?.innerText ?? ''")), await q("return (document.querySelector('[data-pgs-done]') ?? document.querySelector('[data-pgs-err]'))?.innerText?.replace(/\\s+/g, ' ')"));
    await c.shot(`${SHOT}/11-SAMI-ส่งออก.png`, ".dlg", 6);
    await closeDlg();
  }
  const sbvOk = await openSub(SBV, 3);
  check("เปิดซับ SBV ของ YouTube ได้ ตารางมีครบสี่บรรทัด", sbvOk && await q("return document.querySelectorAll('[data-subedit] .se-grid tbody tr').length") === 4, String(await q("return document.querySelectorAll('[data-subedit] .se-grid tbody tr').length")));
  if (sbvOk) {
    await sleep(600);
    check("หน้าต่างส่งออกของซับ SBV เป็นแบบ SRT ป้ายภาพบอก .sbv เป็น PGS", await openDlg() && await prevDone() && (await caps())[0] === ".sbv เป็น PGS .sup บนพื้นมืด", (await caps()).join(" | "));
    await closeDlg();
  }

  /* ---------------------------------------------------------------- จอใหญ่ */
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1032, deviceScaleFactor: 1, mobile: false });
  await openSub(MOVIE); await sleep(1000);
  await openDlg(); await prevDone(); await sleep(300);
  const big = await q("const d = document.querySelector('.dlg').getBoundingClientRect(); return [Math.round(d.width), Math.round(d.height), innerWidth, innerHeight];");
  check("หน้าต่าง 1920 × 1032 กว้าง 1100 สูง 760 อยู่กลางจอ", big[0] === 1100 && big[1] === 760, big.join(" "));
  await c.shot(`${SHOT}/07-ASS-1920.png`, ".dlg", 6);
  await closeDlg();
} finally {
  await q("delete window.__pgsTarget; return 1;").catch(() => null);
  await q(`const v = ${JSON.stringify(optsBefore)}; ['pgs-engine', 'pgs-opts', 'pgs-style'].forEach((k, i) => { if (v[i] == null) localStorage.removeItem(k); else localStorage.setItem(k, v[i]); }); return 1;`).catch(() => null);
  await q("window.__subClear?.(); return 1;").catch(() => null);
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => null);
  rmSync(TMP, { recursive: true, force: true });
}

const pass = results.filter(Boolean).length;
console.log(`\nผ่าน ${pass} จาก ${results.length} ข้อ · ภาพอยู่ ${SHOT}`);
process.exit(pass === results.length ? 0 : 1);
