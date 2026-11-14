// เล่นหนังในกรอบวิดีโอของหน้าแก้ซับด้วย mpv (mpvplay.rs vidPlay.ts · BUGS ข้อ 111 พี่กันสั่ง 14 พ.ย. 2569 "ทำตอนนี้เลย เเต่ระบบเล่นของ aegi ที่ทำมาไม่ลบ เเต่เอาไว้เปิดตอนตั้งค่าได้")
// ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-mpvplay.mjs
// ตั้งตัวเล่นเป็น mpv ความดังศูนย์ (ไม่มีเสียงออกลำโพง) · กดเล่นแล้ว mpv เล่นจริง เวลาเดิน หน้าต่างภาพตรงกรอบ ซับที่กำลังแก้ขึ้นตามเวลา แทร็กเสียงตรงกับคลื่นเสียง
// ของอื่นเปิดทับกรอบ ภาพซ่อน · แก้ซับระหว่างเล่น mpv ได้ฉบับใหม่ · ซูมภาพ หน้าต่างภาพไม่เกินกรอบ · หยุดแล้วปิดไฟล์ ภาพนิ่งอยู่เฟรมที่หยุด
// Ctrl+P · เลือกบรรทัดตอนเล่น · เล่นจนจบ · เล่นเสียงบรรทัดแล้วหนังหยุด · หนัง HEVC · เปิด mpv ไม่ได้แล้วเล่นแบบ Aegisub แทน · หน้าตั้งค่าเลือกตัวเล่นได้
// ไม่เขียนไฟล์หนัง · ภาพที่ mpv วาดถ่ายด้วยคำสั่งทดสอบ mpv_dev_shot กับ PrintWindow (scripts/winshot.ps1) เพราะภาพผ่าน CDP มองไม่เห็นหน้าต่างของ mpv
import { mkdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const MOVIE = "D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).mkv";
const SHOT = "docs/report-2026-11-14/เล่นวิดีโอ";
mkdirSync(SHOT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})});`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const waitFor = async (js, ms = 10000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await q(js)) return true; await sleep(120); } return false; };
const S = "window.__subEdit";
const VP = "window.__vidPlay()";
const props = async (...names) => { const v = await inv("mpv_dev_props", { names }); return Object.fromEntries(names.map((n, i) => [n, v[i]])); };
const waitProp = async (fn, ms = 6000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(150); } return false; };
const ctrlP = async () => {
  await q("document.querySelector('[data-sub-table]').focus(); return 1;");
  await c.send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "p", code: "KeyP", modifiers: 2, windowsVirtualKeyCode: 80 });
  await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "p", code: "KeyP", modifiers: 2, windowsVirtualKeyCode: 80 });
};
/** กล่องของ mpv บนหน้า (ส่วนที่อยู่ในกรอบวิดีโอ) เป็นจุดจริงของจอ */
const boxRect = () => q(`const b = document.querySelector('[data-vmpv]'), f = document.querySelector('[data-vframe]'); if (!b || !f) return null; const r = b.getBoundingClientRect(), k = f.getBoundingClientRect(), d = devicePixelRatio;
  const x0 = Math.max(r.left, k.left), y0 = Math.max(r.top, k.top), x1 = Math.min(r.right, k.right), y1 = Math.min(r.bottom, k.bottom);
  return [Math.round(x0 * d), Math.round(y0 * d), Math.round((x1 - x0) * d), Math.round((y1 - y0) * d)];`);
const sameRect = (a, b) => !!a && !!b && a.every((v, i) => Math.abs(v - b[i]) <= 2);
const winshot = (file, r) => execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/winshot.ps1", "-Out", resolve(file), ...(r ? ["-X", r[0], "-Y", r[1], "-W", r[2], "-H", r[3]].map(String) : [])], { encoding: "utf8" }).trim();

const before = (await inv("get_settings")).settings.subPlayer ?? "mpv";
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
try {
  await inv("set_settings", { patch: { subPlayer: "mpv" } });
  await q(`try { localStorage.setItem('se-aud', JSON.stringify({ link: false, volume: 0 })); localStorage.setItem('se-vauto', '1'); localStorage.setItem('se-fold', '0'); localStorage.removeItem('se-vzoom'); } catch {} return 1;`);
  await q("location.reload(); return 1;").catch(() => {});
  await sleep(2500);
  check("มี libmpv-2.dll ให้ใช้", await inv("mpv_available"));
  await q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === 'ซับไตเติล')?.click(); return 1;`);
  await sleep(300);
  await q(`window.__subClear(); window.__subOpen(${JSON.stringify(MOVIE)}); return 1;`);
  await waitFor("return !!document.querySelector('[data-se-cmds]') && !!window.__vidLib.rate()", 20000);
  await sleep(600);
  await q(`const e = ${S}.get().doc.events.find((x) => x.start === 500 && !x.comment); ${S}.select([e.id], e.id); return 1;`);
  await waitFor("return window.__vidLib.get().pos === window.__vidLib.rate().frameAt(500, 'start');", 5000);
  const p0 = await q("return window.__vidLib.get().pos;");

  // ① กดเล่น
  await c.click("[data-vplay]");
  check("กดเล่นแล้วเล่นด้วย mpv ภาพเดิน", await waitFor(`return ${VP}.playing && ${VP}.engine === 'mpv' && ${VP}.frame > ${p0};`, 10000), JSON.stringify(await q(`return ${VP};`)));
  const m1 = await props("pause", "volume", "path", "@visible", "aid", "current-tracks/audio/ff-index", "sid", "hwdec-current", "video-codec");
  // ตัวเลื่อนความดังต่ำสุดคือ 1 ได้ตัวคูณ (1/50)^3 mpv ได้ 2 จาก 200 ดังเท่ากัน (ราว -100 dB ไม่ได้ยิน)
  check("mpv เล่นอยู่ ความดังเท่าหน้าแก้ซับซึ่งเงียบ หน้าต่างภาพแสดงอยู่", m1.pause === "no" && Number(m1.volume) <= 2.5 && m1["@visible"] === "true" && (m1.path ?? "").endsWith("ฉากตัด (2025).mkv"), JSON.stringify(m1));
  const refStream = await q("return window.__subEdit.get().doc ? (document.querySelector('[data-se-aud-track]')?.dataset.seAudTrack ?? null) : null;");
  check("แทร็กเสียงของ mpv ตรงกับแทร็กของคลื่นเสียง (สตรีมเสียงตัวแรกของหนัง)", m1["current-tracks/audio/ff-index"] != null, `ff-index ${m1["current-tracks/audio/ff-index"]} ${refStream ?? ""}`);
  check("ซับที่กำลังแก้อยู่ใน mpv", m1.sid != null && m1.sid !== "no", `sid ${m1.sid}`);
  // ② ตำแหน่งหน้าต่างภาพตรงกรอบ
  await sleep(300);
  const r1 = await props("@rect"), b1 = await boxRect();
  check("หน้าต่างภาพของ mpv ตรงกับกรอบภาพบนหน้าจอ", sameRect(r1["@rect"]?.split(",").map(Number), b1), `mpv ${r1["@rect"]} กรอบ ${b1}`);
  // ③ เวลาเดิน เลขเฟรมใต้ภาพตรงกับเวลาของ mpv
  const s1 = await inv("mpv_state"); await sleep(1000); const s2 = await inv("mpv_state");
  check("เวลาของ mpv เดินราว 1 วินาที", s2.t - s1.t > 0.7 && s2.t - s1.t < 1.4, `${s1.t} → ${s2.t}`);
  const a = await q(`const t = window.__vidLib.get().table, fr = window.__vidLib.rate(), s = await window.__TAURI_INTERNALS__.invoke('mpv_state'); return { frame: ${VP}.frame, want: fr.frameAt((s.t + t.start) * 1000 - t.base + 0.5) };`);
  check("เลขเฟรมใต้ภาพตรงกับเวลาของ mpv คลาดไม่เกิน 3 เฟรม", Math.abs(a.frame - a.want) <= 3, JSON.stringify(a));
  check("ช่องเวลาบอกเฟรมที่กำลังเล่น ปุ่มเป็นหยุด", await q(`return document.querySelector('[data-vplay]').getAttribute('aria-pressed') === 'true' && /- \\d+$/.test(document.querySelector('[data-vpos]').innerText);`));
  // ④ ซับขึ้นตามเวลา (sub-text ของ mpv)
  const subA = (await props("sub-text"))["sub-text"] ?? "";
  const shotA = resolve(SHOT, "3-mpv-ภาพที่วาด.png");
  await inv("mpv_dev_shot", { path: shotA });
  await sleep(400);
  check("mpv วาดภาพกับซับได้ (ถ่ายภาพจาก mpv)", statSync(shotA, { throwIfNoEntry: false })?.size > 10000, shotA);
  const lum = winshot(`${SHOT}/4-mpv-หน้าต่างจริง.png`, b1);
  check("หน้าต่างจริงตรงกรอบภาพมีภาพหนัง ไม่ดำล้วน (PrintWindow)", Number(lum) > 8, `ความสว่างเฉลี่ย ${lum}`);
  await waitFor("return true;", 10);
  await waitProp(async () => ((await inv("mpv_state")).t ?? 0) > 4.3, 8000);
  await sleep(250);
  const subB = (await props("sub-text"))["sub-text"] ?? "";
  check("ซับที่ mpv แสดงเปลี่ยนตามเวลา", subA.includes("สวัสดี") && subB.includes("ฉากที่สอง"), `${subA.split("\n")[0]} → ${subB.split("\n")[0]}`);
  // ⑤ แก้ซับระหว่างเล่น mpv ได้ฉบับใหม่
  await q(`const t = (await window.__TAURI_INTERNALS__.invoke('mpv_state')).t * 1000; const e = ${S}.get().doc.events.find((x) => !x.comment && x.start <= t + 300 && t + 300 < x.end) ?? ${S}.get().doc.events.find((x) => x.start === 4100); window.__editedId = e.id; ${S}.updateEvent(e.id, { text: e.text + ' แก้ระหว่างเล่น' }, 'ตัวตรวจ'); return 1;`);
  check("แก้ข้อความระหว่างเล่น ซับใน mpv เปลี่ยนตาม", await waitProp(async () => ((await props("sub-text"))["sub-text"] ?? "").includes("แก้ระหว่างเล่น"), 4000), (await props("sub-text"))["sub-text"]);
  await q(`${S}.undo(); return 1;`);
  // ⑥ ของอื่นเปิดทับกรอบ ภาพซ่อน หนังเล่นต่อ
  await q("const d = document.createElement('div'); d.id = '__cover'; d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:transparent'; document.body.append(d); return 1;");
  check("มีของเปิดทับกรอบ หน้าต่างภาพซ่อน หนังยังเล่น", await waitProp(async () => (await props("@visible"))["@visible"] === "false", 2000) && (await q(`return ${VP}.playing;`)));
  await q("document.getElementById('__cover')?.remove(); return 1;");
  check("ของที่ทับปิดแล้ว หน้าต่างภาพกลับมา", await waitProp(async () => (await props("@visible"))["@visible"] === "true", 2000));
  // ภาพผ่าน CDP เห็นแค่ภาพนิ่งข้างใต้หน้าต่างของ mpv ถ่ายทั้งกรอบวิดีโอกับแถบใต้ภาพจากหน้าต่างจริงแทน
  winshot(`${SHOT}/5-mpv-กรอบวิดีโอ-หน้าต่างจริง.png`, await q("const r = document.querySelector('[data-vbox]').getBoundingClientRect(), d = devicePixelRatio; return [Math.round(r.left * d) - 6, Math.round(r.top * d) - 6, Math.round(r.width * d) + 12, Math.round(r.height * d) + 12];"));
  // ⑦ หยุด ปิดไฟล์ ภาพนิ่งอยู่เฟรมที่หยุด
  await c.click("[data-vplay]");
  await sleep(700);
  const st = await q(`return { playing: ${VP}.playing, pos: window.__vidLib.get().pos, img: !!document.querySelector('[data-vframe] img'), box: !!document.querySelector('[data-vmpv]') };`);
  const m2 = await props("@visible", "idle-active");
  check("กดหยุด หน้าต่างภาพซ่อน ไฟล์ปิด ภาพนิ่งเดินหน้าจากเดิม", !st.playing && !st.box && st.img && st.pos > p0 && m2["@visible"] === "false" && m2["idle-active"] === "yes", JSON.stringify({ ...st, ...m2 }));
  // ⑧ Ctrl+P
  await ctrlP();
  check("Ctrl+P เล่น", await waitFor(`return ${VP}.playing && ${VP}.engine === 'mpv';`, 5000));
  await sleep(800);
  await ctrlP();
  check("Ctrl+P อีกครั้งหยุด", await waitFor(`return !${VP}.playing;`, 3000) && await waitProp(async () => (await props("idle-active"))["idle-active"] === "yes", 3000));
  // ⑨ เลือกบรรทัดตอนเล่น เล่นต่อจากบรรทัดนั้น (ไฟล์เดิม ไปเวลาใหม่)
  await c.click("[data-vplay]");
  await waitFor(`return ${VP}.playing && ${VP}.frame > window.__vidLib.get().pos;`, 8000);
  await q(`const e = ${S}.get().doc.events.find((x) => x.start === 12000); ${S}.select([e.id], e.id); return 1;`);
  const f12 = await q("return window.__vidLib.rate().frameAt(12000, 'start');");
  // เวลาของ mpv เองต้องไปถึงบรรทัด (เลขเฟรมบนหน้าเป็นเฟรมเริ่มทันทีตอนเริ่มรอบใหม่ ดูแค่นั้นไม่พอ)
  const mpvAt12 = async () => { const s = await inv("mpv_state"); return s.t != null && s.t >= 11.9 && s.t < 14.5; };
  check("เลือกบรรทัดตอนเล่น เล่นต่อจากเวลาเริ่มของบรรทัดนั้น", await waitFor(`return ${VP}.playing && ${VP}.engine === 'mpv' && ${VP}.frame >= ${f12} && ${VP}.frame < ${f12} + 48;`, 8000) && await waitProp(mpvAt12, 4000), JSON.stringify({ ...(await q(`return ${VP};`)), mpv: (await inv("mpv_state")).t }));
  // ⑨ข กดเล่นแล้วเลือกบรรทัดทันที ตอน mpv ยังเปิดไฟล์ไม่เสร็จ ต้องยังเล่นด้วย mpv ไม่สลับไปแบบ Aegisub และไปถึงบรรทัดนั้น (เดิม seek ล้มตอนไฟล์ยังไม่พร้อม)
  await c.click("[data-vplay]");
  await waitFor(`return !${VP}.playing;`, 3000);
  await waitProp(async () => (await props("idle-active"))["idle-active"] === "yes", 3000);
  await q(`const e = ${S}.get().doc.events.find((x) => x.start === 500 && !x.comment); ${S}.select([e.id], e.id); return 1;`);
  await sleep(300);
  await c.click("[data-vplay]");
  await q(`const e = ${S}.get().doc.events.find((x) => x.start === 12000); ${S}.select([e.id], e.id); return 1;`);
  const raced = await waitProp(mpvAt12, 8000);
  const rv = await q(`return { ...${VP}, vis: null };`);
  check("กดเล่นแล้วเลือกบรรทัดทันที ยังเล่นด้วย mpv และไปถึงบรรทัดนั้น", raced && rv.playing && rv.engine === "mpv" && !rv.err && (await props("@visible"))["@visible"] === "true" && (await props("pause")).pause === "no", JSON.stringify({ ...rv, mpv: (await inv("mpv_state")).t }));
  // ⑩ ซูม 200% ภาพเกินกรอบ หน้าต่างภาพไม่เกินกรอบ mpv ขยายภาพ
  await q("window.__vidLib.setZoom ? window.__vidLib.setZoom(200) : null; return 1;");
  const zoomed = await q("return !!window.__vidLib.setZoom;");
  if (zoomed) {
    await sleep(500);
    const r2 = await props("@rect", "video-zoom", "video-pan-x"), b2 = await boxRect();
    check("ซูม 200% หน้าต่างภาพเท่าส่วนที่เห็นในกรอบ mpv ขยายภาพ", sameRect(r2["@rect"]?.split(",").map(Number), b2) && Number(r2["video-zoom"]) > 0.1, JSON.stringify({ ...r2, กรอบ: b2 }));
    winshot(`${SHOT}/6-mpv-ซูม-หน้าต่างจริง.png`, b2);
    await q("window.__vidLib.setZoom(0); return 1;");
    await sleep(300);
  }
  // ⑪ เล่นจนจบเรื่อง หยุดเอง
  await c.click("[data-vplay]"); await sleep(400);
  const last = await q("return window.__vidLib.rate().count - 1;");
  await q(`window.__vidLib.seek(${last} - 24); return 1;`); await sleep(400);
  await c.click("[data-vplay]");
  check("เล่นจนจบเรื่องแล้วหยุดเอง ภาพอยู่ใกล้เฟรมสุดท้าย", await waitFor(`return ${VP}.engine === 'mpv' || !${VP}.playing;`, 3000) && await waitFor(`return !${VP}.playing;`, 8000) && await waitFor(`return window.__vidLib.get().pos >= ${last} - 3;`, 3000), JSON.stringify(await q(`return { ...${VP}, pos: window.__vidLib.get().pos, last: ${last} };`)));
  // ⑫ เล่นเสียงของบรรทัดตอนหนังเล่นอยู่ หนังหยุด
  await q(`window.__vidLib.seek(24); return 1;`); await sleep(300);
  await c.click("[data-vplay]");
  await waitFor(`return ${VP}.playing && ${VP}.engine === 'mpv' && ${VP}.frame > 24;`, 8000);
  await c.click("[data-se-ab=playline]");
  check("กดเล่นเสียงของบรรทัดตอนหนังเล่นอยู่ หนังหยุด mpv ปิดไฟล์", await waitFor(`return !${VP}.playing;`, 4000) && await waitProp(async () => (await props("idle-active"))["idle-active"] === "yes", 3000));
  await c.click("[data-se-ab=stop]").catch(() => {});
  // ⑬ เปิด mpv ไม่ได้ เล่นแบบ Aegisub แทน บอกเหตุผล
  await q("window.__mpvFail = 'จำลองว่าไม่มี libmpv'; return 1;");
  await c.click("[data-vplay]");
  check("เปิด mpv ไม่ได้ เล่นแบบ Aegisub แทน บอกเหตุผลที่ปุ่ม", await waitFor(`return ${VP}.playing && ${VP}.engine === 'aegisub' && (document.querySelector('[data-vplay]').dataset.vplayerr ?? '').includes('จำลองว่าไม่มี libmpv');`, 5000), JSON.stringify(await q(`return ${VP};`)));
  await c.click("[data-vplay]");
  await q("delete window.__mpvFail; return 1;");
  await waitFor(`return !${VP}.playing;`, 3000);
  // ⑭ หนังภาพ HEVC
  const HEVC = "D:/movie-shelf/test-media/สร้าง/หนัง/HEVC Test (2020).mkv";
  await q(`window.__subClear(); window.__subOpen("D:/movie-shelf/test-media/สร้าง/แก้ซับ/ฉากตัด (2025).th.ass"); return 1;`);
  await waitFor("return !!document.querySelector('[data-se-cmds]');", 15000);
  await q(`window.__subVideo(${JSON.stringify(HEVC)}); return 1;`);
  await waitFor("return !!window.__vidLib.rate() && window.__vidLib.get().pos != null;", 30000);
  await sleep(500);
  const h0 = await q("return window.__vidLib.get().pos;");
  await c.click("[data-vplay]");
  const hv = await waitFor(`return ${VP}.playing && ${VP}.engine === 'mpv' && ${VP}.frame > ${h0} + 24;`, 12000);
  const mh = await props("video-codec", "hwdec-current", "path");
  check("หนังภาพ HEVC เล่นด้วย mpv ภาพเดินเกิน 24 เฟรม", hv && (mh["video-codec"] ?? "").toLowerCase().includes("hevc"), JSON.stringify({ ...(await q(`return ${VP};`)), ...mh }));
  const bh = await boxRect();
  winshot(`${SHOT}/7-mpv-HEVC-หน้าต่างจริง.png`, bh);
  await c.click("[data-vplay]");
  await waitFor(`return !${VP}.playing;`, 3000);
  // ⑮ หน้าตั้งค่าเลือกตัวเล่นได้ ค่าผิดกลับเป็น mpv
  await q(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === 'ตั้งค่า')?.click(); return 1;`);
  await sleep(500);
  await q("document.querySelector('[data-setnav=av]')?.click(); return 1;");
  await sleep(400);
  const row = await q("return !!document.querySelector('[data-subplayer-set]') && document.querySelector('[data-subplayer-set]').offsetParent !== null;");
  check("หน้าตั้งค่ามีแถวเลือกตัวเล่นหนังในหน้าแก้ซับ", row);
  if (row) {
    await q("[...document.querySelectorAll('[data-subplayer-set] button, [data-subplayer-set] [role=radio]')].find((b) => b.innerText.includes('Aegisub'))?.click(); return 1;");
    await sleep(500);
    check("กดแบบ Aegisub แล้วค่าตั้งเปลี่ยน", (await inv("get_settings")).settings.subPlayer === "aegisub");
    await c.shot(`${SHOT}/8-ตั้งค่าตัวเล่น.png`, "[data-subplayer-set]", 8);
    await q("[...document.querySelectorAll('[data-subplayer-set] button, [data-subplayer-set] [role=radio]')].find((b) => b.innerText.trim() === 'mpv')?.click(); return 1;");
    await sleep(400);
    check("กด mpv กลับ ค่าตั้งเป็น mpv", (await inv("get_settings")).settings.subPlayer === "mpv");
  }
  const bad = await inv("set_settings", { patch: { subPlayer: "vlc" } }).catch((e) => ({ err: String(e) }));
  check("ค่าที่ไม่รู้จักกลับเป็น mpv", (await inv("get_settings")).settings.subPlayer === "mpv", JSON.stringify(bad?.subPlayer ?? bad));
} finally {
  await q(`try { delete window.__mpvFail; document.getElementById('__cover')?.remove(); window.__vidPlayStop?.(); localStorage.setItem('se-vauto', '1'); localStorage.removeItem('se-vzoom'); } catch {} return 1;`).catch(() => {});
  await inv("set_settings", { patch: { subPlayer: before } }).catch(() => {});
  await c.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  c.close();
}
const ok = results.filter(Boolean).length;
console.log(`\nผ่าน ${ok} จาก ${results.length} ข้อ`);
process.exit(ok === results.length ? 0 : 1);
