// เทสกับโปรแกรมที่สร้างจริง (TECH-REVIEW ข้อ 5) · tauri dev ไม่ใช้กติกาความปลอดภัย (CSP) ตัวจริง รูปขึ้นใน dev ไม่ได้แปลว่าขึ้นในตัวจริง
// เช็ก ① หน้าโหลดจากตัวโปรแกรม ไม่ใช่ dev server ② กติกาความปลอดภัยบังคับจริง (รูปจากเน็ตโดนกัน)
//      ③ ปกบนชั้นกับโปสเตอร์ในแผงขวาโหลดผ่าน asset ได้ ④ ฟอนต์ Sarabun ที่ฝังในโปรแกรมโหลดได้ ⑤ ไม่มีของโดนกันนอกจากที่ตั้งใจลอง
// ใช้: scripts/dev-app.ps1 -Built (ปิดตัว dev ก่อน) แล้ว node scripts/check-built.mjs <โฟลเดอร์ผลเทส>
import { mkdirSync, writeFileSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = process.argv[2] ?? "docs/report-2026-11-06/ขั้น2";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const q = (js) => c.evaluate(`(() => { ${js} })()`);

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
