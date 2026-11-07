// เทสกับโปรแกรมที่สร้างจริง (TECH-REVIEW ข้อ 5) · tauri dev ไม่ใช้กติกาความปลอดภัย (CSP) ตัวจริง รูปขึ้นใน dev ไม่ได้แปลว่าขึ้นในตัวจริง
// เช็ก ① หน้าโหลดจากตัวโปรแกรม ไม่ใช่ dev server ② กติกาความปลอดภัยบังคับจริง (รูปจากเน็ตโดนกัน)
//      ③ ปกบนชั้นกับโปสเตอร์ในแผงขวาโหลดผ่าน asset ได้ ④ ฟอนต์ Sarabun ที่ฝังในโปรแกรมโหลดได้ ⑤ ไม่มีของโดนกันนอกจากที่ตั้งใจลอง
// ใช้: scripts/dev-app.ps1 -Built (ปิดตัว dev ก่อน) แล้ว node scripts/check-built.mjs <โฟลเดอร์ผลเทส>
import { mkdirSync, writeFileSync, copyFileSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = process.argv[2] ?? "docs/report-2026-11-06/ขั้น2";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const q = (js) => c.evaluate(`(() => { ${js} })()`);
// ชั้นวางของตัวเทสนี้เอง มีเรื่องที่มีปก (Harbor Lights) กับเรื่องที่ยังไม่มีปก · เดิมใช้ชั้นที่ค้างจากตัวเทสก่อนหน้า
// รันต่อจากตัวเทสขั้น 6 แล้วชั้นไม่มีปกสักเรื่อง ล้มสองข้อ (เจอตอนรันเทสรวม 7 พ.ย. 2569)
const TMP = "D:\\dev\\tmp";
for (const d of readdirSync(TMP)) if (d.startsWith("ชั้นตัวจริงรวม")) rmSync(join(TMP, d), { recursive: true, force: true });
const DIR = join(TMP, `ชั้นตัวจริงรวม-${Date.now()}`);
mkdirSync(DIR, { recursive: true });
for (const f of ["Harbor Lights (2021).mkv", "ดาวเหนือ (2023).mkv"]) copyFileSync(resolve("test-media", "สร้าง", "หนัง", f), join(DIR, f));
await c.evaluate(`window.__TAURI_INTERNALS__.invoke("set_settings", { patch: { folders: [${JSON.stringify(DIR)}], viewMode: "grid", coverSize: "m", coverOrient: "tall", rescanOnStart: true } })`);

// จดทุกครั้งที่กติกาความปลอดภัยกันของ ตั้งแต่ก่อนหน้าโหลด แล้วโหลดหน้าใหม่
await c.send("Page.enable");
await c.send("Page.addScriptToEvaluateOnNewDocument", {
  source: "window.__csp = []; document.addEventListener('securitypolicyviolation', (e) => window.__csp.push({ dir: e.violatedDirective, uri: e.blockedURI, sample: e.sample }));",
});
await c.evaluate("location.reload()");
await sleep(1500);
// รออ่านโฟลเดอร์เสร็จ
for (let i = 0; i < 300; i++) {
  const busy = await q("return !!document.querySelector('.topbar .btn-wait')");
  if (!busy) break;
  await sleep(200);
}
await sleep(500);

const origin = await q("return location.origin");
check("หน้าโหลดจากตัวโปรแกรม ไม่ใช่ dev server", origin === "http://tauri.localhost", origin);

// รอรูปโหลดครบ
await q("return Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; })))");
const imgs = await q(`return [...document.querySelectorAll('.cover.has-img img, img.dposter, .lv img.th')].map((i) => ({ src: i.src.slice(0, 40), w: i.naturalWidth, h: i.naturalHeight }))`);
check("ปกบนชั้นโหลดผ่าน asset ได้ทุกรูป ขนาด 300 × 450", imgs.length > 0 && imgs.every((i) => i.w === 300 && i.h === 450), `${imgs.length} รูป · ${JSON.stringify(imgs[0] ?? {})}`);

// เลือกเรื่องที่มีปก แผงขวาต้องขึ้นโปสเตอร์
await q("document.querySelector('.book[data-movie=\"Harbor Lights (2021)\"]')?.click()");
await sleep(400);
const poster = await q("const i = document.querySelector('img.dposter'); return i ? { w: i.naturalWidth, ok: i.complete } : null");
check("โปสเตอร์ในแผงขวาโหลดได้", poster && poster.w === 300, JSON.stringify(poster));

const font = await q("return document.fonts.ready.then(() => ({ th: document.fonts.check('600 15px Sarabun', 'ชั้นหนัง'), loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family + ' ' + f.weight) }))");
check("ฟอนต์ Sarabun ที่ฝังในโปรแกรมโหลดได้", font.th && font.loaded.length > 0, font.loaded.join(" · "));

const before = await q("return window.__csp.slice()");
check("ไม่มีของโดนกติกาความปลอดภัยกันตอนเปิดชั้น", before.length === 0, before.length ? JSON.stringify(before.slice(0, 3)) : "ไม่มี");

// ขั้น 4 · ภาพตัวอย่างในหน้าต่างครอปกับรูปที่จะแนบ อยู่โฟลเดอร์ previews ของโปรแกรม ต้องโหลดได้ภายใต้กติกาตัวจริง
{
  const img = "D:\\movie-shelf\\test-media\\สร้าง\\รูป\\wide.jpg";
  const r = await c.evaluate(`(async () => {
    const inv = window.__TAURI_INTERNALS__.invoke;
    const info = await inv("poster_open", { path: ${JSON.stringify(img)} });
    const out = await inv("poster_render", { req: { geo: { rotate: 0, flip: false, mode: "crop", x: info.crop[0], y: info.crop[1], w: info.crop[2], h: info.crop[3], pad: "#ffffff" }, format: "jpg", quality: 90, choose: false, sizes: false } });
    const load = (p) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i.naturalWidth + "x" + i.naturalHeight); i.onerror = () => ok("โหลดไม่ได้"); i.src = window.__TAURI_INTERNALS__.convertFileSrc(p); });
    return { src: await load(info.preview), out: await load(out.preview) };
  })()`);
  check("ภาพตัวอย่างของหน้าต่างครอปกับรูปที่จะแนบโหลดได้ (โฟลเดอร์ previews)", r.src === "1200x675" && r.out === "1000x1500", JSON.stringify(r));
}

// ขั้น 5 · กดปุ่มคัดลอกบนหน้าจอจริง ① หน้าต่างไม่ได้โฟกัส คัดลอกไม่ได้ ต้องขึ้นแถบบอกเหตุผล ไม่เงียบ ② ได้โฟกัส ต้องขึ้นว่าคัดลอกแล้ว
{
  const toastNow = () => q("return [...document.querySelectorAll('.toast')].map((t) => t.innerText.replace(/\\n/g, ' / ')).join(' || ')");
  await c.click('.book[data-movie="Harbor Lights (2021)"]'); await sleep(300);
  await c.evaluate("[...document.querySelectorAll('.detail .btn')].find(b => b.innerText.includes('ข้อมูลไฟล์')).click()");
  for (let i = 0; i < 60 && !(await q("return !!document.querySelector('[data-mi]')")); i++) await sleep(150);
  const copyBtn = "[...document.querySelectorAll('button')].find(b => b.innerText === 'คัดลอกข้อมูลเป็นข้อความ').click()";
  // โฟกัสขึ้นกับว่าหน้าต่างอยู่หน้าหรือหลัง คุมไม่ได้ทุกรอบ จึงจำลองว่าระบบไม่ให้คัดลอก ด้วยข้อผิดพลาดแบบเดียวกับที่เจอจริง
  await c.evaluate(`(() => { const cb = navigator.clipboard; window.__realWrite = cb.writeText.bind(cb);
    cb.writeText = () => Promise.reject(new DOMException("Failed to execute 'writeText' on 'Clipboard': Document is not focused.", "NotAllowedError")); })()`);
  await c.evaluate(copyBtn); await sleep(500);
  const bad = await toastNow();
  await c.evaluate("navigator.clipboard.writeText = window.__realWrite");
  await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 100, y: 600 }); await sleep(250);
  await c.shot(`${OUT}/17-คัดลอกไม่สำเร็จ.png`, ".toast", 6).catch(() => {});
  check("ระบบไม่ให้คัดลอก (หน้าต่างไม่ได้โฟกัส) กดคัดลอก ขึ้นแถบแดง คัดลอกไม่สำเร็จ บอกวิธีแก้ ไม่เงียบ", bad.includes("คัดลอกไม่สำเร็จ") && bad.includes("หน้าต่างโปรแกรมไม่ได้โฟกัสอยู่") && bad.includes("คลิกที่หน้าต่างโปรแกรมแล้วกดคัดลอกอีกครั้ง") && !bad.includes("คัดลอกข้อมูลไฟล์แล้ว"), bad);
  // ปิดแถบแดงก่อน (ผิดพลาดไม่หายเอง) แล้วลองแบบได้โฟกัส
  await c.evaluate("document.querySelectorAll('.toast button').forEach((b) => b.click())"); await sleep(300);
  await c.send("Emulation.setFocusEmulationEnabled", { enabled: true }); await sleep(200);
  await c.evaluate(copyBtn); await sleep(500);
  const ok = await toastNow();
  check("ได้โฟกัสแล้ว กดคัดลอก ขึ้นแถบ คัดลอกข้อมูลไฟล์แล้ว", ok.includes("คัดลอกข้อมูลไฟล์แล้ว"), ok);
  await c.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  // กลับชั้นวางด้วยปุ่มบนจอ แล้วปิดแถบที่ค้าง ภาพสุดท้ายต้องเป็นชั้นวาง
  await c.evaluate("[...document.querySelectorAll('button')].find(b => b.innerText === 'กลับไปชั้นวาง')?.click()"); await sleep(300);
  await c.evaluate("document.querySelectorAll('.toast button').forEach((b) => b.click())"); await sleep(400);
  const back = await q("return { book: document.querySelector('.book.sel')?.dataset.movie ?? null, detail: document.querySelector('.detail')?.innerText.includes('Harbor Lights (2021)') }");
  check("กลับจากหน้าข้อมูลไฟล์ ชั้นวางยังเลือกเรื่องเดิม (Harbor Lights) ไม่เด้งไปเรื่องแรก", back.book === "Harbor Lights (2021)" && back.detail, JSON.stringify(back));
}

// ขั้น 5 · ข้อความ MediaInfo กับปุ่มคัดลอกข้อมูลเป็นข้อความ (คัดลอกได้เฉพาะหน้าที่ปลอดภัย ต้องลองกับตัวจริง)
{
  const mv = "D:\\movie-shelf\\test-media\\สร้าง\\หนัง\\ดาวเหนือ (2023).mkv";
  // หน้าต่างเทสเปิดแบบไม่รับโฟกัส (ไม่แย่งหน้าจอพี่กัน) เบราว์เซอร์ไม่ให้คัดลอกถ้าหน้าไม่ได้โฟกัส
  // ให้หน้าถือว่าได้โฟกัส เหมือนตอนคนคลิกหน้าต่างแล้วกดปุ่มคัดลอก
  await c.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await sleep(200);
  const r = await c.evaluate(`(async () => {
    const info = await window.__TAURI_INTERNALS__.invoke("media_info", { path: ${JSON.stringify(mv)} });
    let copied = "ไม่ได้";
    try { await navigator.clipboard.writeText("ทดสอบคัดลอก"); copied = "ได้"; } catch (e) { copied = String(e); }
    return { sections: info.sections.length, secure: window.isSecureContext, copied };
  })()`);
  check("ข้อความ MediaInfo อ่านได้ · หน้าเป็นแบบปลอดภัย คัดลอกข้อความได้", r.sections >= 7 && r.secure && r.copied === "ได้", JSON.stringify(r));
}

// ลองโหลดรูปจากเน็ต ต้องโดนกัน = กติกาบังคับจริง (ถ้าไม่โดนกัน แปลว่าเทสนี้ไม่ได้เทสอะไรเลย)
await q("const i = new Image(); i.src = 'https://example.com/โดนกัน.png'; document.body.appendChild(i); setTimeout(() => i.remove(), 500);");
await sleep(800);
const after = await q("return window.__csp.slice()");
const blocked = after.find((v) => v.uri.startsWith("https://example.com"));
check("รูปจากเน็ตโดนกติกาความปลอดภัยกัน (กติกาบังคับจริง)", !!blocked, blocked ? `${blocked.dir} · ${blocked.uri}` : "ไม่โดนกัน");

await c.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 100, y: 600 });
await sleep(250);
await c.shot(`${OUT}/16-โปรแกรมที่สร้างจริง.png`);
writeFileSync(`${OUT}/ผลเทสตัวจริง.json`, JSON.stringify({ when: new Date().toISOString(), results }, null, 1));
const pass = results.filter((r) => r.pass).length;
console.log(`\nผ่าน ${pass} จาก ${results.length}`);
process.exit(pass === results.length ? 0 : 1);
