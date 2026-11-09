// ตารางชั้นวาง เสียงกับซับเป็นป้ายบอกภาษาแถวเดียว มีคอลัมน์ซับ เครื่องหมายรูปเดียวกับบนชั้น · ใช้: เปิด scripts/dev-app.ps1 ก่อน แล้ว node scripts/check-table.mjs
// ไล่หน้าต่าง 1280 กับ 1024 ทั้งเปิดและปิดแผงขวา · คืนมุมมองเดิมตอนจบ
import { mkdirSync } from "node:fs";
import { connect, sleep } from "./lib/cdp-client.mjs";

const OUT = "docs/report-2026-11-09/ตารางชั้นวาง";
mkdirSync(OUT, { recursive: true });
const c = await connect();
const q = (js) => c.evaluate(`(async () => { ${js} })()`);
const inv = (cmd, args) => q(`return await window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args ?? {})});`);
const results = [];
const check = (name, ok, note = "") => { results.push(!!ok); console.log(`${ok ? "✅" : "❌"} ${name}${note !== "" ? " · " + note : ""}`); };
const measure = () => q(`const w = document.querySelector('[data-table]'), t = w.querySelector('table'), r = (e) => e.getBoundingClientRect();
  const rows = [...t.querySelectorAll('tbody tr')];
  const one = (td) => { const on = [...td.querySelectorAll('.lvchip, .lvmore')].filter((x) => x.style.display !== 'none'); return new Set(on.map((x) => Math.round(r(x).top))).size <= 1 && on.every((x) => r(x).right <= r(td).right + 0.5); };
  return { กว้างกรอบ: Math.round(r(w).width), กว้างตาราง: Math.round(r(t).width), ขวาสุดเกิน: Math.round(Math.max(...rows.slice(0, 1).map((x) => r(x.lastElementChild).right)) - r(w).right),
    head: [...t.querySelectorAll('thead th')].map((h) => h.innerText.trim()),
    เสียงแถวเดียว: rows.every((x) => one(x.querySelector('.lv-a'))), ซับแถวเดียว: rows.every((x) => one(x.querySelector('.lv-s'))),
    สถานะมีรูป: rows.every((x) => x.querySelector('.lvstat .badge svg')), ชื่อกว้าง: Math.round(r(rows[0].children[1]).width), แถวสูง: Math.round(r(rows[0]).height),
    videoตัด: rows.filter((x) => { const v = x.querySelector('.lv-v .lvchip'); return v && v.scrollWidth > v.clientWidth; }).map((x) => x.querySelector('.lv-v').innerText),
    videoชน: rows.some((x) => { const v = x.querySelector('.lv-v'), a = x.querySelector('.lv-a .lvchip'), k = v.querySelector('.lvchip'); if (!a || !k) return false; return r(k).right > r(a).left; }),
    ปุ่มกรองล้น: [...document.querySelectorAll('[data-shelf-tab]')].filter((b) => b.scrollWidth > b.clientWidth).map((b) => b.innerText),
    โซ่เห็น: !!document.querySelector('[data-shelf-tab="linked"] svg')?.getClientRects().length,
    ป้ายศูนย์: [...t.querySelectorAll('.lvmore')].filter((x) => x.style.display !== 'none' && x.textContent === '+0').length,
    ป้ายตัดไม่มีจุด: [...t.querySelectorAll('.lvchips')].filter((x) => { const on = [...x.querySelectorAll('.lvchip')].filter((k) => k.style.display !== 'none'); return on.some((k) => r(k).right > r(x).right + 0.5 || (k.scrollWidth > k.clientWidth && getComputedStyle(k).textOverflow !== 'ellipsis')); }).length,
    ป้ายบวก: t.querySelectorAll('.lvmore:not([style*="none"])').length,
    ตัวอย่าง: rows.slice(0, 3).map((x) => [...x.querySelectorAll('.lv-a .lvchip, .lv-s .lvchip')].filter((e) => e.style.display !== 'none').map((e) => e.textContent).join(' , ')) };`);
const m0 = (m) => m.ชื่อกว้าง >= 90 && m.ขวาสุดเกิน <= 0 && m.กว้างตาราง <= m.กว้างกรอบ;
const before = (await inv("get_settings")).settings;
try {
  await q("[...document.querySelectorAll('.nav')].find((b) => b.textContent.includes('ชั้นวางหนัง')).click();"); await sleep(600);
  await inv("set_settings", { patch: { viewMode: "table" } });
  await q("location.reload();").catch(() => null); await sleep(2500);
  for (let i = 0; i < 40 && !(await q("return !!document.querySelector('[data-table] tbody tr');").catch(() => false)); i++) await sleep(250);
  const closePanel = async () => { await q("document.querySelector('.dclose')?.click();"); await sleep(250); };
  await closePanel();
  for (const w of [1280, 1024]) {
    await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: w === 1280 ? 800 : 640, deviceScaleFactor: 1, mobile: false });
    await sleep(450);
    for (const panel of [false, true]) {
      if (panel) { await q("document.querySelector('[data-table] tbody tr').click();"); await sleep(350); } else await closePanel();
      const m = await measure();
      const tag = `กว้าง ${w} ${panel ? "เปิดแผงขวา" : "ปิดแผงขวา"}`;
      if (w === 1280 && !panel) { console.log(m.ตัวอย่าง.join("\n")); check("มีคอลัมน์ Subtitle ระหว่าง Audio กับสภาพไฟล์", JSON.stringify(m.head.slice(-3)) === '["Audio","Subtitle","สภาพไฟล์"]', m.head.join(" ")); }
      check(`${tag} เสียงกับซับบรรทัดเดียว เครื่องหมายมีรูป`, m.เสียงแถวเดียว && m.ซับแถวเดียว && m.สถานะมีรูป, `แถวสูง ${m.แถวสูง}`);
      check(`${tag} คอลัมน์ขวาสุดไม่ตกขอบ`, m.ขวาสุดเกิน <= 0 && m.กว้างตาราง <= m.กว้างกรอบ, `ตาราง ${m.กว้างตาราง} กรอบ ${m.กว้างกรอบ} ชื่อกว้าง ${m.ชื่อกว้าง} ป้ายบวก ${m.ป้ายบวก}`);
      check(`${tag} ไม่มีป้าย +0 ป้ายยาวตัดท้ายมีจุดไข่ปลา`, m.ป้ายศูนย์ === 0 && m.ป้ายตัดไม่มีจุด === 0, `+0 ${m.ป้ายศูนย์} · ตัดไม่มีจุด ${m.ป้ายตัดไม่มีจุด}`);
      const st = await q("const r = (e) => e.getBoundingClientRect(); return [...document.querySelectorAll('[data-table] tbody tr')].filter((x) => { const c = x.children[1], s = c.querySelector('.stars'); return !s || r(s).right > r(c).right + 0.5; }).length;");
      check(`${tag} ดาวใต้ชื่อไม่ล้นช่องชื่อ`, st === 0, st);
      check(`${tag} ข้อความ Video ไม่ชนป้ายเสียง`, !m.videoชน, `ตัดท้าย ${m.videoตัด.length} แถว · โซ่ปุ่มกรอง ${m.โซ่เห็น ? "เห็น" : "ซ่อน"} · ปุ่มล้น ${m.ปุ่มกรองล้น.join(", ") || "ไม่มี"}`);
      if (w === 1280 && !panel) {
        const look = await q(`const css = (e) => e ? getComputedStyle(e).backgroundColor : null; const find = (t) => [...document.querySelectorAll('[data-table] .lvchip')].find((e) => e.textContent.includes(t));
          return { H264: css(find('AVC')), HEVC: css(find('HEVC')), AAC: css(find('AAC')), AC3: css(find('AC-3')), SRT: css(find('SRT')), ASS: css(find('ASS')) };`);
        const vals = Object.values(look).filter(Boolean);
        check("ป้ายสีตามชนิด แต่ละชนิดคนละสี ตรงกับหน้าเสียงและซับ", new Set(vals).size === vals.length && look.AAC === "rgb(251, 223, 240)" && look.AC3 === "rgb(251, 233, 223)" && look.SRT === "rgb(251, 246, 223)", JSON.stringify(look));
      }
      if (w === 1280 && !panel) check("ช่องเสียงบอกภาษา", (await q("return [...document.querySelectorAll('[data-table] .lv-a .lvchip')].map((e) => e.textContent).join(' ');")).includes("ไทย"), m.ตัวอย่าง[1]);
      await c.shot(`${OUT}/${w}-${panel ? "เปิดแผง" : "ปิดแผง"}.png`, ".main");
    }
  }
  // หน้าต่าง 1024 เมนูย่อ เปิดแผงขวา กรอบตารางราว 604 จุด (เคยทำช่องชื่อเหลือ 20 จุด)
  await q("document.querySelector('[data-table] tbody tr').click();"); await sleep(300);
  if (!(await q("return !!document.querySelector('.detail');"))) { await q("document.querySelector('[data-table] tbody tr').click();"); await sleep(300); }
  await q("document.querySelector('.navtoggle').click();"); await sleep(500);
  const mini = await measure();
  const miniStars = await q("const r = (e) => e.getBoundingClientRect(); return [...document.querySelectorAll('[data-table] tbody tr')].filter((x) => { const c = x.children[1], s = c.querySelector('.stars'); return r(s).right > r(c).right + 0.5; }).length;");
  check("หน้าต่าง 1024 เมนูย่อ เปิดแผงขวา ช่องชื่อกว้างพอ ดาวไม่ล้น ตารางไม่ตกขอบ", m0(mini) && miniStars === 0, `ตาราง ${mini.กว้างตาราง} กรอบ ${mini.กว้างกรอบ} ชื่อกว้าง ${mini.ชื่อกว้าง} ดาวล้น ${miniStars}`);
  await c.shot(`${OUT}/1024-เมนูย่อ-เปิดแผง.png`, ".main");
  await q("document.querySelector('.navtoggle').click();"); await sleep(400);
  await c.send("Emulation.clearDeviceMetricsOverride", {});
  await closePanel();
  await sleep(300);
  /* ปุ่มเล็ก กลาง ใหญ่ · ชี้รูปขึ้นภาพใหญ่ (ไม่กดปุ่มขยาย) */
  const seg = (t) => `[...document.querySelectorAll('.topbar .seg button')].find((b) => b.innerText.trim() === '${t}')`;
  const expect = { "เล็ก": [45, "s"], "กลาง": [60, "m"], "ใหญ่": [96, "l"] };
  for (const [t, [h, v]] of Object.entries(expect)) {
    await q(`${seg(t)}.click();`);
    for (let i = 0; i < 30 && (await q("return Math.round(document.querySelector('.lv tbody .th:not(.wide)').getBoundingClientRect().height);")) !== h; i++) await sleep(150);
    await sleep(150);
    const got = await q(`const b = ${seg(t)}, i = document.querySelector('.lv tbody .th:not(.wide)'), w = document.querySelector('[data-table]'), tb = w.querySelector('table'), last = tb.querySelector('tbody tr').lastElementChild; const cell = i.closest('td').getBoundingClientRect(), ib = i.getBoundingClientRect(); return { กดได้: b.getAttribute('aria-disabled') !== 'true' && !b.disabled, h: Math.round(ib.height), w: Math.round(ib.width), อยู่กลาง: Math.abs((cell.left + cell.width / 2) - (ib.left + ib.width / 2)) < 1.5, ในช่อง: ib.left >= cell.left && ib.right <= cell.right, ล้น: last.getBoundingClientRect().right > w.getBoundingClientRect().right }; `);
    check(`ปุ่ม${t} ในตาราง รูปสูง ${h} จุด อยู่กลางช่อง ตารางไม่ตกขอบ`, got.กดได้ && got.h === h && got.อยู่กลาง && got.ในช่อง && !got.ล้น, JSON.stringify(got));
    await c.shot(`${OUT}/ขนาด-${v}.png`, ".main");
  }
  await q(`${seg("กลาง")}.click();`); await sleep(300);
  await q("document.querySelector('.lv img.th')?.scrollIntoView({ block: 'center' });"); await sleep(250);
  await c.hover(".lv img.th"); await sleep(350);
  const pop = await q("const p = document.querySelector('[data-bigpop]'); if (!p) return null; const r = p.getBoundingClientRect(), i = p.querySelector('img'), s = document.querySelector('.lv img.th').getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), ในจอ: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, ขึ้นรูป: i.complete && i.naturalWidth > 0, ไม่ทับรูปเล็ก: r.left >= s.right || r.right <= s.left };");
  check("ชี้รูปในตาราง ขึ้นภาพใหญ่ ไม่ตกจอ ไม่ทับรูปเล็ก", pop?.ในจอ && pop.ขึ้นรูป && pop.ไม่ทับรูปเล็ก && pop.h > 200, JSON.stringify(pop));
  await c.shot(`${OUT}/ชี้รูป.png`);
  await c.hover(".topbar .search"); await sleep(250);
  check("เอาเมาส์ออก ภาพใหญ่หาย", await q("return !document.querySelector('[data-bigpop]');"));
  await q("[...document.querySelectorAll('[data-table] thead button')].find((b) => b.innerText.includes('Subtitle')).click();"); await sleep(200);
  const sorted = await q("return [...document.querySelectorAll('[data-table] tbody .lv-s')].map((t) => t.innerText);");
  check("กดหัวคอลัมน์ Subtitle เรียงได้", sorted.join("|") === [...sorted].sort((a, b) => a.localeCompare(b, "th")).join("|"), sorted.slice(0, 4).join(" , "));
} finally {
  await c.send("Emulation.clearDeviceMetricsOverride", {}).catch(() => null);
  await inv("set_settings", { patch: { viewMode: before.viewMode, coverSize: before.coverSize } });
  await q("location.reload();").catch(() => null);
}
const pass = results.filter(Boolean).length;
console.log(`ผ่าน ${pass} ไม่ผ่าน ${results.length - pass}`);
c.close();
process.exit(results.every(Boolean) ? 0 : 1);
