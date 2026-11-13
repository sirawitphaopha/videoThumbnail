// ไล่ทุกหน้าของโปรแกรมที่ขนาดหน้าต่างของจอที่พี่กันใช้จริง (พี่กันสั่ง 13 พ.ย. 2569 "เธอเอาสองความละเอียด 3 อย่างนี้ไปไว้ในตัวตรวจด้วย ทั่ง 1080 2K 4K")
// ขนาด 1280 × 800 หน้าต่างตอนยังไม่กดขยาย (เท่ากันทุกจอ เพราะ Windows ขยายตามจอให้) · ขยายเต็มจอ 1600 × 852 จอเครื่องที่ รพ. · 1920 × 1032 จอ 1080 หรือ 4K ขยาย 200%
//      2560 × 1392 จอ 2K หรือ 4K ขยาย 150% · ที่มาของตัวเลขดู docs/mockups/window-sizes.html
// ไม่ตรวจ 3840 × 2112 (4K ขยาย 100%) พี่กันสั่งเอาออก 13 พ.ย. 2569 "เอา 4 k ออกจากตัวตรวจ … จอ 4K จะแสดงผลแบบ 2K เท่านั้น" งานอยู่ ROADMAP หัวข้อจอ 4K แสดงผลแบบ 2K
// ไม่ตรวจกว้าง 1024 (แบ่งครึ่งจอ) พี่กันสั่งพักไว้ทำหลังสุด BUGS ข้อ 71 74
// ใช้: node scripts/check-sizes.mjs [โฟลเดอร์ภาพ]  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1 แบบอยู่หลังสุด)
// จำลองขนาดผ่าน CDP ไม่ย่อขยายหน้าต่างจริง · หยุดทันทีถ้าหน้าต่างชั้นหนังอยู่หน้าสุดของจอ (มีคนใช้อยู่)
// ผ่านเมื่อ ทุกหน้าทุกขนาด ไม่มีแถบเลื่อนแนวนอน ไม่มีปุ่มหรือช่องยื่นเลยขอบขวาของหน้าต่าง และหัวกราฟกับแถบล่างของหน้ากราฟเสียงไม่มีปุ่มซ้อนกัน
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

try { execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolve("scripts", "fg-gate.ps1")], { stdio: "inherit" }); }
catch { console.log("หน้าต่างชั้นหนังอยู่หน้าสุดของจอ หยุดตรวจ"); process.exit(2); }

const OUT = process.argv[2] ?? "docs/report-2026-11-13/ขนาดจอ";
mkdirSync(OUT, { recursive: true });
const SONG = resolve("test-media", "สร้าง", "เสียงซับ", "เพลงทดสอบ 96k.flac").replace(/\\/g, "/");
// ส่งขนาดเองได้ทาง SIZES เช่น SIZES=1024x640 (ใช้พิสูจน์ว่าตัวตรวจจับของล้นได้ และไว้ตรวจตอนทำ BUGS ข้อ 71 74)
const SIZES = process.env.SIZES
  ? process.env.SIZES.split(",").map((s) => { const [w, h] = s.split("x").map(Number); return [w, h, "ขนาดที่ส่งมา"]; })
  : [
    [1280, 800, "ยังไม่กดขยาย"],
    [1600, 852, "ขยาย จอ 1600"],
    [1920, 1032, "ขยาย จอ 1080"],
    [2560, 1392, "ขยาย จอ 2K"],
  ];
const PAGES = ["ชั้นวางหนัง", "ใส่โปสเตอร์", "จับคู่ปก", "เสียงและซับ", "ตรวจไฟล์", "กราฟเสียง", "บิตเรต", "MediaInfo", "ตั้งค่า"];
const VIEWS = ["wave", "loud", "spek", "psd"];

const c = await connect();
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const results = [];
const check = (name, pass, detail = "") => { results.push(!!pass); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const nav = (label) => c.evaluate(`[...document.querySelectorAll('.side .nav')].find((b) => b.innerText.trim().split(String.fromCharCode(10))[0] === ${JSON.stringify(label)})?.click()`);
const waitFor = async (js, ms = 30000) => { for (let t = 0; t < ms; t += 200) { if (await q(js)) return true; await sleep(200); } return false; };
const drop = (p) => c.evaluate(`window.__TAURI_INTERNALS__.invoke('plugin:event|emit_to', { target: { kind: 'Webview', label: 'main' }, event: 'tauri://drag-drop', payload: { paths: [${JSON.stringify(p)}], position: { x: 700, y: 400 } } })`);

/** ปุ่ม ช่อง ดรอปดาวน์ ที่มองเห็น ยื่นเลยขอบขวาของหน้าต่าง · แถบเลื่อนแนวนอนของทั้งหน้า · กรอบที่เลื่อนแนวนอนได้เพราะของล้น
    ยกเว้นกรอบที่ห่อตาราง ซึ่งตั้งใจให้เลื่อนแนวนอน (รอบแรกยกเว้นทุกกรอบ แถบล่างหน้าความถี่ที่ล้นอยู่ในกรอบกราฟที่เลื่อนได้เลยหลุด เจอตอนพิสูจน์ที่ 1024) */
const EDGE = `
  const vis = (e) => { const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false; const s = getComputedStyle(e); return s.visibility !== 'hidden' && s.display !== 'none'; };
  const scrollsX = (p) => { const s = getComputedStyle(p).overflowX; return (s === 'auto' || s === 'scroll') && p.scrollWidth > p.clientWidth + 1; };
  const inTableScroll = (e) => { for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) if (scrollsX(p) && p.querySelector('table')) return true; return false; };
  const name = (e) => (e.innerText || e.getAttribute('aria-label') || e.className || e.tagName).toString().trim().replace(/\\s+/g, ' ').slice(0, 20);
  const out = [...document.querySelectorAll('button, input, select, textarea, .dd, .seg, .chip')].filter((e) => vis(e) && e.getBoundingClientRect().right > innerWidth + 1 && !inTableScroll(e)).map(name);
  const boxX = [...document.querySelectorAll('body *')].filter((p) => vis(p) && scrollsX(p) && !p.querySelector('table')).map((p) => (p.className || p.tagName).toString().slice(0, 24) + ' ' + (p.scrollWidth - p.clientWidth));
  return JSON.stringify({ pageX: document.documentElement.scrollWidth - innerWidth, out: [...new Set(out)].slice(0, 6), boxX: boxX.slice(0, 4) });
`;
/** ปุ่มในแถวเดียวกันซ้อนกัน เทียบกรอบทุกคู่ (ตัวเลข scrollWidth ไม่ล้นพิสูจน์ไม่ได้ ชิ้นที่หดได้ซ้อนกันโดยไม่ล้น · CLAUDE.md 13 พ.ย. 2569) */
const OVERLAP = (sel) => `
  const rows = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((h) => h.getBoundingClientRect().width > 0);
  const hits = [];
  for (const row of rows) {
    const leaf = [...row.querySelectorAll('button, .lbl, .hzoom, .fsep, b, .infob, .dd')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; });
    const R = (e) => e.getBoundingClientRect();
    for (let i = 0; i < leaf.length; i++) for (let j = i + 1; j < leaf.length; j++) {
      const a = leaf[i], b = leaf[j]; if (a.contains(b) || b.contains(a)) continue;
      const p = R(a), r = R(b), ox = Math.min(p.right, r.right) - Math.max(p.left, r.left), oy = Math.min(p.bottom, r.bottom) - Math.max(p.top, r.top);
      if (ox > 0.5 && oy > 0.5) hits.push((a.innerText || a.className).trim().slice(0, 12) + ' ทับ ' + (b.innerText || b.className).trim().slice(0, 12));
    }
  }
  return JSON.stringify({ rows: rows.length, hits: hits.slice(0, 4) });
`;
const shot = async (name, w, h) => {
  const s = await c.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: w >= 2560 ? 0.5 : 1 } });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.data, "base64"));
};

try {
  // หน้ากราฟเสียงกับหน้าบิตเรตต้องมีไฟล์เปิดอยู่ · ใช้เพลงทดสอบในชุดทดสอบ
  await c.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await nav("กราฟเสียง"); await sleep(800);
  await q("document.querySelector('[data-cmpclose]')?.click(); document.querySelector('[data-gmode=graph]')?.click(); return 1"); await sleep(300);
  if (!(await q("return !!document.querySelector('[data-view]') && !!document.querySelector('[data-plot]')"))) {
    await q("[...document.querySelectorAll('button')].find((b) => b.innerText.includes('เปิดหน้ากราฟใหม่'))?.click(); return 1"); await sleep(300);
    await drop(SONG);
    await waitFor("return !!document.querySelector('[data-plot]') && !document.querySelector('[data-graphloading]')", 90000);
  }
  await nav("บิตเรต"); await sleep(800);
  if (!(await q("return !!document.querySelector('[data-pageslot=bitrate] canvas')"))) {
    await drop(SONG);
    await waitFor("return !!document.querySelector('[data-pageslot=bitrate] canvas')", 90000);
  }
  await c.move(2, 2);

  for (const [w, h, label] of SIZES) {
    await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(600);
    for (const page of PAGES) {
      await nav(page); await sleep(900);
      if (page === "กราฟเสียง") {
        for (const v of VIEWS) {
          await q(`document.querySelector('[data-view=${v}]')?.click(); return 1`); await sleep(1500);
          const e = JSON.parse(await q(EDGE)), o = JSON.parse(await q(OVERLAP(".ag[data-graphview] .plothead, .ag[data-graphview] .agfoot")));
          check(`${w}×${h} ${label} กราฟเสียง ${v} ไม่ล้นขวา หัวกราฟกับแถบล่างไม่มีปุ่มซ้อน`, e.pageX <= 0 && !e.out.length && !e.boxX.length && o.rows >= 1 && !o.hits.length, JSON.stringify({ ...e, ...o }));
          await shot(`${w}x${h}-กราฟเสียง-${v}`, w, h);
        }
        await q("document.querySelector('[data-view=wave]')?.click(); return 1"); await sleep(500);
        continue;
      }
      const e = JSON.parse(await q(EDGE));
      check(`${w}×${h} ${label} ${page} ไม่มีแถบเลื่อนแนวนอน ไม่มีปุ่มยื่นเลยขอบขวา`, e.pageX <= 0 && !e.out.length && !e.boxX.length, JSON.stringify(e));
      await shot(`${w}x${h}-${page}`, w, h);
    }
  }
} finally {
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => {});
  await nav("ชั้นวางหนัง").catch(() => {});
}
console.log(`\nผ่าน ${results.filter(Boolean).length} จาก ${results.length} ข้อ · ภาพอยู่ ${OUT}`);
process.exit(results.every(Boolean) ? 0 : 1);
