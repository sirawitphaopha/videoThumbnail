// ป้าย +จำนวน ใต้ปก เมื่อป้ายเสียงซับล้นสองบรรทัด (AUDIT 12 พ.ย. 2569 ข้อ 4 · เดิมป้ายนี้ซ่อนตัวเองจนไม่เคยขึ้น)
// ใช้: node scripts/check-btmore.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1)
// สร้างไฟล์ MKV เสียง 6 ชนิด ซับ 3 แบบ ใน D:\dev\tmp\ชั้นป้ายล้น ชี้ชั้นวางไปชั่วคราว แล้วคืนโฟลเดอร์กับขนาดปกเดิมตอนจบ
// ผ่านเมื่อ ปกเล็กและปกกลาง ป้ายที่ถูกซ่อนมีป้าย +จำนวน ขึ้น ตัวเลขเท่าจำนวนที่ซ่อน และแถบป้ายไม่เกินสองบรรทัด
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const DIR = "D:/dev/tmp/ชั้นป้ายล้น";
const OUT = "D:/dev/tmp/ชั้นป้ายล้น-ภาพ";
const SUB = join("test-media", "สร้าง", "เสียงซับ");
mkdirSync(DIR, { recursive: true });
mkdirSync(OUT, { recursive: true });
execFileSync(resolve("src-tauri", "tools", "ffmpeg.exe"), ["-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "testsrc2=size=320x240:rate=25:duration=3", "-f", "lavfi", "-i", "sine=440:sample_rate=48000:duration=3",
  "-i", join(SUB, "ดาวตก (2024).th.srt"), "-i", join(SUB, "ดาวตก (2024).en.ass"), "-i", join(SUB, "ดาวตก (2024).en.vtt"),
  "-map", "0:v", ...Array(6).fill(["-map", "1:a"]).flat(), "-map", "2", "-map", "3", "-map", "4",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a:0", "aac", "-ac:a:0", "2", "-c:a:1", "ac3", "-ac:a:1", "6", "-c:a:2", "eac3", "-ac:a:2", "6",
  "-c:a:3", "flac", "-c:a:4", "libopus", "-c:a:5", "libmp3lame", "-c:s:0", "srt", "-c:s:1", "ass", "-c:s:2", "webvtt", join(DIR, "ป้ายเยอะ (2025).mkv")]);

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push(!!pass); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)}).then((r) => JSON.stringify(r ?? null))`).then(JSON.parse);
const nav = (label) => c.evaluate(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split('\\n')[0] === ${JSON.stringify(label)})?.click()`);
const scan = async () => { await inv("scan_library"); for (let i = 0; i < 100; i++) { await sleep(200); if (!(await inv("get_library")).scanning) break; } };
const before = (await inv("get_settings")).settings;
const keep = { coverSize: before.coverSize, showNames: before.showNames, viewMode: before.viewMode, folders: before.folders };
await inv("set_settings", { patch: { folders: [DIR] } });
await scan();
await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 2, mobile: false });
try {
  for (const size of ["s", "m"]) {
    await inv("set_settings", { patch: { coverSize: size, showNames: true, viewMode: "grid" } });
    await c.evaluate("location.reload()"); await sleep(2500);
    await nav("ชั้นวางหนัง"); await sleep(1200);
    const x = JSON.parse(await c.evaluate(`(() => { const el = document.querySelector('[data-movie="ป้ายเยอะ (2025)"] [data-booktags]'); if (!el) return 'null';
      const real = [...el.querySelectorAll(':scope > .bt:not(.btmore)')], hid = real.filter((t) => t.style.display === 'none'), more = el.querySelector(':scope > .btmore');
      return JSON.stringify({ real: real.length, hidden: hid.length, more: more && more.style.display !== 'none' ? more.textContent : '', lines: new Set([...el.children].filter((t) => t.style.display !== 'none').map((t) => t.offsetTop)).size }); })()`));
    check(`ปก ${size} ป้ายล้น มีป้าย +จำนวน เท่าป้ายที่ซ่อน และไม่เกินสองบรรทัด`, x && x.hidden > 0 && x.more === `+${x.hidden}` && x.lines <= 2, JSON.stringify(x));
    const b = JSON.parse(await c.evaluate(`(() => { const e = document.querySelector('[data-movie="ป้ายเยอะ (2025)"]'); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return JSON.stringify({ x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height }); })()`));
    await sleep(300);
    const s = await c.send("Page.captureScreenshot", { format: "png", clip: { x: b.x - 6, y: b.y - 6, width: b.w + 12, height: b.h + 12, scale: 1 } });
    writeFileSync(`${OUT}/ปก-${size}.png`, Buffer.from(s.data, "base64"));
  }
} finally {
  await inv("set_settings", { patch: keep });
  await scan();
  await c.evaluate("location.reload()"); await sleep(1500);
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => {});
}
console.log(`\nผ่าน ${results.filter(Boolean).length} จาก ${results.length} ข้อ · ภาพอยู่ ${OUT}`);
process.exit(results.every(Boolean) ? 0 : 1);
