// ตัวตรวจงานเก็บ AUDIT 99 ข้อ (BUGS ข้อ 161 · docs/PLAN-2026-11-27-AUDIT.md · รายงาน docs/REPORT-2026-11-27-AUDIT-99ข้อ.md)
// เปิดหน้าจอจริงในระบบจำลองหน้าโปรแกรมบนเว็บ (docs/mockups/theme-live-app.html) ด้วย Playwright ไม่ต้องเปิดโปรแกรม ไม่ขึ้นจอ ใช้ได้บนเครื่องคลาวด์
// ใช้เซิร์ฟเวอร์ 1420 ที่เปิดอยู่ ไม่มีก็เปิด vite เองแล้วปิดตอนจบ
// node scripts/check-audit161.mjs           ตรวจทุกข้อ
// node scripts/check-audit161.mjs 37 38     ตรวจเฉพาะข้อที่บอก (เลขข้อใน AUDIT)
// SHOTS=<โฟลเดอร์> ถ่ายภาพหน้าจอท้ายแต่ละข้อไว้ดูด้วยตา (ข้อ-<เลข>.png)
// ตรรกะล้วนตรวจด้วยการ import ไฟล์ ts ผ่าน vite ในหน้า (`await import("/src/...")`) ไม่ต้องคอมไพล์เอง
import { spawn } from "child_process";
import { createRequire } from "module";

if (process.platform === "win32") process.env.PLAYWRIGHT_BROWSERS_PATH ??= "0";
const BASE = "http://127.0.0.1:1420", URL = `${BASE}/docs/mockups/theme-live-app.html`;
const MOVIE = "D:\\หนัง\\ดาวเหนือ (2023).mkv";
const up = async () => { try { return (await fetch(URL)).ok; } catch { return false; } };

// ---------------------------------------------------------------- ตัวช่วย
const nav = (p, label) => p.evaluate((l) => { const b = [...document.querySelectorAll("[data-navbar] button")].find((x) => x.querySelector(".navtxt")?.textContent.trim() === l); if (!b) throw new Error("ไม่เจอเมนู " + l); b.click(); }, label);
const click = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); if (!e) throw new Error("ไม่เจอ " + s); e.click(); }, sel);
const clickText = (p, text, sel = "button,[role=tab],a") => p.evaluate(([t, s]) => {
  const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const all = [...document.querySelectorAll(s)].filter(vis);
  const hit = all.find((e) => e.innerText.trim() === t) ?? all.find((e) => e.innerText.trim().startsWith(t));
  if (!hit) throw new Error("ไม่เจอปุ่ม " + t);
  hit.click();
}, [text, sel]);
const pick = (p, path) => p.evaluate((x) => { window.__pickNext = x; }, path);
/** สลับคำตอบของคำสั่งในระบบจำลอง · body เป็นฟังก์ชัน async ได้ตัวแปร a · เรียกตัวเดิมด้วย await window.__fxOverBase.<คำสั่ง>(a) */
const over = (p, cmd, body) => p.evaluate(([c, b]) => { const AF = Object.getPrototypeOf(async function () {}).constructor; (window.__fxOver ??= {})[c] = new AF("a", b); }, [cmd, body]);
/** สลับคำตอบตั้งแต่ก่อนหน้าโหลด (คำสั่งที่โปรแกรมเรียกตอนเปิด) แล้วโหลดหน้าใหม่ */
const overBoot = async (p, cmd, body) => {
  await p.addInitScript(([c, b]) => { const AF = Object.getPrototypeOf(async function () {}).constructor; (window.__fxOver ??= {})[c] = new AF("a", b); }, [cmd, body]);
  await p.reload(); await p.waitForSelector("[data-navbar]"); await wait(p, 1500);
};
const text = (p, sel) => p.evaluate((s) => document.querySelector(s)?.innerText ?? null, sel);
const wait = (p, ms) => p.waitForTimeout(ms);
/** เรียกฟังก์ชันจากไฟล์ ts ในหน้า · fn เป็นข้อความ body ที่ได้ตัวแปร m (โมดูล) กับ a (ค่าที่ส่ง) */
const mod = (p, file, body, arg) => p.evaluate(async ([f, b, a]) => new Function("m", "a", b)(await import(f), a), [file, body, arg]);

// ---------------------------------------------------------------- ข้อตรวจ แต่ละข้อเปิดหน้าใหม่ ข้อมูลตัวอย่างชุดเดิม
const T = {};

// ชุด 1 ----------------------------------------------------------------
T[37] = async (p, check) => {
  await p.evaluate(() => [...document.querySelectorAll(".book")].find((b) => b.getAttribute("aria-label")?.includes("ปกจับคู่"))?.click());
  await p.waitForSelector("[data-link-remove]"); await click(p, "[data-link-remove]"); await wait(p, 300);
  const t = await text(p, ".dialog, [role=dialog]");
  check("37 หน้าต่างถามก่อนเอาปกจับคู่ออกบอกสิ่งที่จะเกิด ไม่บอกว่าย้ายไปแล้ว", !!t && t.includes("จะย้ายลงถังขยะ") && !t.includes("ถังขยะแล้ว"), t);
};
T[38] = async (p, check) => {
  const folders = [{ path: "D:\\หนัง", ok: true, count: 0, error: null }];
  await p.evaluate((f) => window.__emit("scan-finished", { movies: [], folders: f, scanning: false }), folders); await wait(p, 300);
  const t = await text(p, "[data-shelf-nomovies]");
  const go = await p.evaluate(() => !!document.querySelector("[data-shelf-nomovies-go]"));
  check("38 โฟลเดอร์ไม่มีไฟล์หนัง ชั้นวางบอกเหตุพร้อมปุ่มไปตั้งค่าโฟลเดอร์และปุ่มอ่านใหม่", !!t && t.includes("ยังไม่มีไฟล์หนัง") && t.includes("อ่านโฟลเดอร์ใหม่") && go, t);
  // ทุกโฟลเดอร์หาไม่เจอ มีการ์ดโฟลเดอร์หายบอกอยู่แล้ว ไม่ขึ้นซ้ำ
  await p.evaluate(() => window.__emit("scan-finished", { movies: [], folders: [{ path: "E:\\ไม่มี", ok: false, count: 0, error: "หาไม่เจอ" }], scanning: false })); await wait(p, 300);
  const t2 = await text(p, "[data-shelf-nomovies]");
  check("38 ทุกโฟลเดอร์หาไม่เจอ ไม่ขึ้นคำว่าโฟลเดอร์ไม่มีหนังซ้อนกับการ์ดโฟลเดอร์หาย", t2 === null, t2);
  await p.evaluate((f) => window.__emit("scan-finished", { movies: [], folders: f, scanning: false }), folders); await wait(p, 300);
};
T[39] = async (p, check) => {
  const name = await p.evaluate(() => [...document.querySelectorAll(".book")].find((b) => b.getAttribute("aria-label")?.includes("ปกจับคู่"))?.dataset.movie);
  const word = name.split(" (")[0];
  await p.fill("input[aria-label='ค้นหาชื่อหนัง']", word); await wait(p, 300);
  await click(p, "[data-shelf-tab=none]"); await wait(p, 300);
  const t = await text(p, "[data-shelf-hidden]");
  check("39 ค้นชื่อที่มีจริงแต่ตัวกรองปกซ่อน บอกว่าเจอกี่เรื่องแต่อยู่นอกตัวกรอง ไม่โทษคำค้น", !!t && t.includes(word) && /1 เรื่อง/.test(t) && t.includes("นอกตัวกรอง"), t);
  await clickText(p, "ดูทั้งหมด"); await wait(p, 300);
  const n = await p.evaluate(() => document.querySelectorAll(".book").length);
  check("39 ปุ่มดูทั้งหมดล้างตัวกรอง หนังที่ค้นขึ้นชั้น", n >= 1, n);
  await click(p, "[data-shelf-tab=none]"); await wait(p, 300);
};
T[61] = async (p, check) => {
  const r = await mod(p, "/src/lib/status.ts", `
    const now = Date.now() / 1000, mk = (status, at) => ({ ext: "mkv", status, check: at ? { at } : null });
    return { legend: m.SHELF_LABEL.warn, due: m.labelOf(mk("ok", now - 40 * 86400), 30), un: m.labelOf(mk("unchecked"), 30),
      ch: m.labelOf(mk("changed", now), 30), part: m.labelOf(mk("partial", now), 30), ok: m.labelOf(mk("ok", now), 30) };`);
  check("61 ป้ายจุดเหลืองในแถบล่างนับเหตุถึงเวลาตรวจซ้ำด้วย", r.legend.includes("ถึงเวลาตรวจซ้ำ") && r.legend.includes("ยังไม่เคยตรวจ"), r.legend);
  check("61 ป้ายบนปกบอกเหตุของเรื่องนั้น ถึงเวลาตรวจซ้ำ ยังไม่เคยตรวจ ไฟล์เปลี่ยน ตรวจได้บางส่วน", r.due.includes("ถึงเวลาตรวจซ้ำ") && r.un.includes("ยังไม่เคยตรวจ") && r.ch.includes("เปลี่ยน") && r.part.includes("บางส่วน") && r.ok === "ไฟล์สมบูรณ์", JSON.stringify(r));
  const bar = await p.evaluate(() => { const b = document.querySelector("[data-legend=warn]")?.parentElement; return b ? b.scrollWidth - b.clientWidth : -1; });
  check("61 แถบป้ายสีล่างชั้นวางไม่ล้นหลังป้ายยาวขึ้น", bar === 0, bar);
};
T[43] = async (p, check) => {
  await over(p, "poster_open", `const r = await window.__fxOverBase.poster_open(a); return { ...r, width: 1500, height: 1000, twoThree: false, aspect: "แนวนอน 3 : 2", crop: [0, 0, 1500, 1000] };`);
  // การ์ดเลือกแบบปกขึ้นกับรูปที่ส่งมาจากปกจับคู่ (ไม่ได้ครอปเอง) · เริ่มจากปุ่มรวมเข้าไฟล์ของเรื่องที่มีปกจับคู่บนชั้นวาง
  await p.evaluate(() => [...document.querySelectorAll(".book")].find((b) => b.getAttribute("aria-label")?.includes("ปกจับคู่"))?.click());
  await p.waitForSelector("[data-link-merge]"); await click(p, "[data-link-merge]");
  await p.waitForSelector("[data-not23]", { timeout: 8000 }); await wait(p, 300);
  await over(p, "poster_render", `await new Promise((ok) => setTimeout(ok, 1500)); return await window.__fxOverBase.poster_render(a);`);
  await p.evaluate(() => [...document.querySelectorAll("[data-not23] .seg button")].find((b) => b.innerText.includes("เติมขอบ"))?.click()); await wait(p, 200);
  const mid = await p.evaluate(() => { const b = document.querySelector("[data-start]"); return { dis: b.getAttribute("aria-disabled"), title: b.title }; });
  check("43 ระหว่างทำรูปแบบใหม่ ปุ่มเริ่มกดไม่ได้พร้อมเหตุผล", mid.dis === "true" && mid.title === "รอทำรูปให้เสร็จก่อน", JSON.stringify(mid));
  await wait(p, 1800);
  const after = await p.evaluate(() => document.querySelector("[data-start]").title);
  check("43 ทำรูปเสร็จ เหตุผลรอทำรูปหายไป", after !== "รอทำรูปให้เสร็จก่อน", after);
};
T[45] = async (p, check) => {
  await nav(p, "ใส่โปสเตอร์"); await wait(p, 300);
  await pick(p, "D:\\รูปปก\\รูปไม่มีนามสกุล"); await click(p, "[data-drop=poster]"); await wait(p, 400);
  const t = await text(p, "[data-drop=poster]");
  check("45 รูปไม่มีนามสกุล ขึ้นเป็นประโยค ไม่มีเครื่องหมายคำถามแทนคำ", !!t && t.includes("ไฟล์ที่ไม่มีนามสกุลใช้ไม่ได้") && !t.includes(".?"), t);
};

// ชุด 2 ----------------------------------------------------------------
/** หน้าใส่โปสเตอร์ ใส่หนังกับรูปแล้วหน้าครอปเปิดเอง */
const posterWithImage = async (p, img = "D:\\รูปปก\\ตัวอย่าง.jpg") => {
  await nav(p, "ใส่โปสเตอร์"); await wait(p, 300);
  await pick(p, MOVIE); await click(p, "[data-drop=movie]"); await wait(p, 800);
  await pick(p, img); await click(p, "[data-drop=poster]"); await p.waitForSelector("[data-use]"); await wait(p, 300);
};
/** เรื่องแรกที่มีปกจับคู่บนชั้นวาง แก้ค่าปกจับคู่ได้ก่อนกดรวมเข้าไฟล์ */
const linkedMerge = async (p, geo) => {
  if (geo) await p.evaluate(async (g) => {
    const name = [...document.querySelectorAll(".book")].find((b) => b.getAttribute("aria-label")?.includes("ปกจับคู่"))?.dataset.movie;
    const lib = await window.__TAURI_INTERNALS__.invoke("get_library");
    const m = lib.movies.find((x) => x.name === name);
    window.__emit("movie-updated", { ...m, linked: m.linked.map((c) => ({ ...c, geo: g })) });
  }, geo);
  await wait(p, 200);
  await p.evaluate(() => [...document.querySelectorAll(".book")].find((b) => b.getAttribute("aria-label")?.includes("ปกจับคู่"))?.click());
  await p.waitForSelector("[data-link-merge]"); await click(p, "[data-link-merge]"); await wait(p, 1200);
};
const GEO = { rotate: 0, flip: false, mode: "crop", x: 0, y: 0, w: 1000, h: 1500, pad: "#000000", tilt: 0, aspect: "" };
T[52] = async (p, check) => {
  await posterWithImage(p);
  await p.evaluate(() => [...document.querySelectorAll(".dlg .seg button")].find((b) => b.innerText.includes("ปกนอน 16 : 9"))?.click()); await wait(p, 300);
  await click(p, "[data-use]"); await wait(p, 800);
  const t = await text(p, ".ppmode");
  check("52 รูป 2 : 3 ที่ครอปเป็นปกนอน การ์ดบอกว่าครอปเป็นปกนอน ไม่ใช่สัดส่วน 2 : 3 พอดีปก", t?.includes("ปกนอน 16 : 9") && !t.includes("พอดีปก"), t);
};
T[53] = async (p, check) => {
  await linkedMerge(p, { ...GEO, tilt: Number(process.env.TILT ?? 3) });
  await clickText(p, "ครอป/แปลงรูป"); await p.waitForSelector("[data-use]"); await wait(p, 300);
  const r = await p.evaluate(() => { const b = document.querySelector(".dlg"); const body = b?.querySelector(".dlg-body") ?? b; return { tilt: !!document.querySelector("[data-tilt]"), val: document.querySelector("[data-tilt-val]")?.textContent, over: body ? body.scrollHeight - body.clientHeight : -1, wover: b ? b.getBoundingClientRect().bottom - window.innerHeight : 0 }; });
  check("53 รูปจากปกจับคู่ที่เอียงไว้ หน้าครอปของหน้าใส่โปสเตอร์มีแถบปรับเอียงบอก +3°", r.tilt && r.val === "+3°", JSON.stringify(r));
  check("53 แถบที่เพิ่มไม่ดันหน้าต่างครอปล้นจอหรือต้องเลื่อน", r.over <= 0 && r.wover <= 0, JSON.stringify(r));
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/ข้อ-53-เอียง.png` });
  await clickText(p, "ยกเลิก"); await wait(p, 300);
  await p.goto(URL); await p.waitForSelector("[data-navbar]"); await wait(p, 1500);
  await posterWithImage(p);
  const none = await p.evaluate(() => !!document.querySelector("[data-tilt]"));
  check("53 รูปที่ไม่เอียง หน้าใส่โปสเตอร์ไม่มีแถบปรับเอียงเหมือนเดิม", !none, none);
};
T[54] = async (p, check) => {
  await posterWithImage(p); await click(p, "[data-use]"); await wait(p, 800);
  const before = await p.evaluate(() => document.querySelector("[data-start]").title);
  await p.evaluate(() => { const r = document.querySelector("[data-drop=poster]").getBoundingClientRect(); window.__emit("tauri://drag-drop", { paths: ["D:\\รูปปก\\ไฟล์เสีย.txt"], position: { x: r.left + r.width / 2, y: r.top + r.height / 2 } }); }); await wait(p, 500);
  const r = await p.evaluate(() => { const b = document.querySelector("[data-start]"); return { dis: b.getAttribute("aria-disabled"), title: b.title }; });
  check("54 รูปใหม่ใช้ไม่ได้ การ์ดรูปแดง ปุ่มเริ่มกดไม่ได้พร้อมเหตุผล ไม่แนบรูปเดิมเงียบ ๆ", before === "" && r.dis === "true" && r.title.includes("รูปล่าสุดใช้ไม่ได้"), JSON.stringify({ before, ...r }));
};
T[57] = async (p, check) => {
  await posterWithImage(p);
  await p.evaluate(() => [...document.querySelectorAll(".dlg .seg button")].find((b) => b.innerText.includes("เติมขอบ"))?.click()); await wait(p, 300);
  await click(p, "[data-pad-custom]"); await p.waitForSelector("[data-pad-paste]");
  await over(p, "clipboard_text", `return "ข้อความอื่นที่ไม่ใช่รหัสสี";`);
  await click(p, "[data-pad-paste]"); await wait(p, 300);
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/ข้อ-57-วางไม่ได้.png` });
  const r = await p.evaluate(() => { const b = document.querySelector("[data-pad-paste]"); return { bad: b.dataset.bad, label: b.getAttribute("aria-label"), color: getComputedStyle(b).color }; });
  check("57 วางรหัสสีไม่สำเร็จ ปุ่มเปลี่ยนหน้าตาและบอกว่าคลิปบอร์ดไม่มีรหัสสี", r.bad === "true" && r.label === "คลิปบอร์ดไม่มีรหัสสี", JSON.stringify(r));
  await wait(p, 2000);
  const back = await p.evaluate(() => document.querySelector("[data-pad-paste]").getAttribute("aria-label"));
  check("57 ผ่านไปสองวินาทีปุ่มกลับเป็นวางรหัสสี", back === "วางรหัสสี", back);
};
T[71] = async (p, check) => {
  const src = await (await fetch(`${BASE}/src/components/CloseGuard.tsx?raw`)).text();
  check("71 หน้าต่างกันปิดบอกว่าจำทุกคู่ที่รออยู่ ทั้งที่ติ๊กและไม่ได้ติ๊ก", src.includes("จำทุกคู่ที่รออยู่ ทั้งที่ติ๊กและไม่ได้ติ๊ก") && !src.includes("จำคู่ที่ติ๊กไว้"));
};
T[75] = async (p, check) => {
  const count = () => p.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.innerText.includes("เฉพาะเรื่องที่ยังไม่มีปก")); return b ? Number(b.innerText.replace(/[^\d]/g, "")) : null; });
  await overBoot(p, "link_state", `return { rows: [], imageFolders: [], loose: [], scope: "nocover", waiting: 0 };`);
  await nav(p, "จับคู่ปก"); await wait(p, 500);
  const n0 = await count();
  await p.evaluate(async () => {
    const lib = await window.__TAURI_INTERNALS__.invoke("get_library");
    const m = lib.movies.find((x) => !x.hasCover && !x.linked?.length);
    window.__emit("movie-updated", { ...m, missing: true });
  }); await wait(p, 300);
  const n1 = await count();
  check("75 ปุ่มเฉพาะเรื่องที่ยังไม่มีปกไม่นับเรื่องที่ไดรฟ์ถอดออกอยู่ เหมือนตัวจับคู่", n0 > 0 && n1 === n0 - 1, `${n0} → ${n1}`);
};

// ชุด 3 ----------------------------------------------------------------
/** หน้าจับคู่ปก ตารางตรวจผล */
const linkTable = async (p) => {
  await nav(p, "จับคู่ปก"); await wait(p, 500);
  if (!(await p.$("[data-link-row]"))) { await click(p, "[data-link-open]"); }
  await p.waitForSelector("[data-link-row]"); await wait(p, 300);
};
/** เนื้อไฟล์โค้ดตามที่อยู่ในดิสก์ (vite ?raw ส่งเป็น export default "…" ถอดกลับเป็นข้อความ) */
const SRC = async (file) => { const t = await (await fetch(`${BASE}/${file}?raw`)).text(); const m = /^export default (".*");?\s*$/s.exec(t); return m ? JSON.parse(m[1]) : t; };
const toastText = (p) => p.evaluate(() => document.querySelector(".toasts")?.innerText ?? "");
T[69] = async (p, check) => {
  const rt = await SRC("src/pages/link/ReviewTable.tsx"), lj = await SRC("src/lib/linkJob.ts"), dr = await SRC("src/pages/link/useBoardDrag.ts");
  check("69 ตารางตรวจผลหาภาพปกจากแผนที่ที่ทำครั้งเดียว ไม่ค้นทั้งคลังทุกแถว", rt.includes("coverOf.get(r.id)") && !/movies\.find\(\(x\) => x\.id === r\.id\)/.test(rt));
  check("69 ภาพเล็กที่เสร็จรวมเป็นชุดก่อนแจ้งหน้าจอ และเงาที่ลากบนกระดานวาดครั้งเดียวต่อเฟรม", lj.includes("flushThumbs") && dr.includes("requestAnimationFrame(flush)"));
  // ทำงานจริง ภาพปกที่มีอยู่ยังขึ้นในแถว · ภาพเล็กที่แจ้งมาหลายรูปติดกันขึ้นครบหลังรวมชุด
  await linkTable(p);
  const imgs = await p.evaluate(async () => (await window.__TAURI_INTERNALS__.invoke("link_images")).slice(0, 5).map((i) => i.path));
  await nav(p, "จับคู่ปก"); await click(p, "[data-link-goboard]").catch(() => {}); await wait(p, 500);
  await p.evaluate((ps) => ps.forEach((x, i) => window.__emit("link-thumb", { path: x, thumb: `data:image/gif;base64,R0lGODlhAQABAAAAACw=#${i}` })), imgs);
  await wait(p, 250);
  const got = await p.evaluate((ps) => ps.filter((x, i) => [...document.querySelectorAll("img")].some((im) => im.getAttribute("src")?.endsWith("#" + i))).length, imgs);
  check("69 ภาพเล็กห้ารูปที่แจ้งติดกันขึ้นบนกระดานครบหลังรวมชุด", imgs.length === 0 || got === imgs.length, `${got} จาก ${imgs.length}`);
};
T[70] = async (p, check) => {
  await linkTable(p);
  const none = await p.evaluate(() => document.querySelector("[data-link-status=none] [data-link-tick]")?.title);
  check("70 ช่องติ๊กของแถวที่ยังไม่มีรูปบอกเหตุผล", none?.includes("ยังไม่มีรูป"), none);
  // เอาติ๊กออกทุกแถวแล้วดูปุ่มยืนยันที่ติ๊กไว้
  await over(p, "link_row_update", `const r = await window.__fxOverBase.link_state(a); r.rows.forEach((x) => { x.ticked = false; }); return r;`);
  await p.evaluate(() => document.querySelector("[data-link-tick][aria-checked=true]")?.click()); await wait(p, 400);
  const tk = await p.evaluate(() => { const b = document.querySelector("[data-link-confirm-ticked]"); return { dis: b.getAttribute("aria-disabled"), title: b.title }; });
  check("70 ปุ่มยืนยันคู่ที่ติ๊กไว้ตอนยังไม่ได้ติ๊ก บอกเหตุผลติดปุ่ม", tk.dis === "true" && tk.title.includes("ยังไม่ได้ติ๊ก"), JSON.stringify(tk));
  // กดหยุดระหว่างยืนยัน ปุ่มบอกว่ารับคำสั่งแล้วและกดซ้ำไม่ได้
  await over(p, "link_confirm", `await new Promise((ok) => setTimeout(ok, 4000)); return { done: 0, failed: 0, stopped: true, notes: [], reply: await window.__fxOverBase.link_state(a) };`);
  await over(p, "link_cancel", `window.__cancels = (window.__cancels ?? 0) + 1; return null;`);
  await click(p, "[data-link-confirm-all]"); await p.waitForSelector("[data-link-stop]", { timeout: 4000 });
  await click(p, "[data-link-stop]"); await wait(p, 150); await click(p, "[data-link-stop]"); await wait(p, 150);
  const st = await p.evaluate(() => { const b = document.querySelector("[data-link-stop]"); return { txt: b?.innerText.trim(), dis: b?.getAttribute("aria-disabled"), n: window.__cancels }; });
  check("70 กดหยุดแล้วปุ่มขึ้นว่ากำลังหยุดหลังคู่นี้ กดซ้ำไม่ส่งคำสั่งซ้ำ", st.txt === "กำลังหยุดหลังคู่นี้…" && st.dis === "true" && st.n === 1, JSON.stringify(st));
  await wait(p, 4200);
};
T[72] = async (p, check) => {
  await linkTable(p);
  await over(p, "link_row_update", `const r = await window.__fxOverBase.link_state(a); r.rows[0].status = "saved"; return r;`);
  await p.evaluate(() => document.querySelector("[data-link-tick]")?.click()); await wait(p, 400);
  await p.evaluate(() => window.__applyTone("night")); await wait(p, 300);
  const r = await p.evaluate(() => {
    const sv = document.querySelector("[data-link-savedtick]") ?? document.querySelector("[data-link-status=saved] svg[aria-label='บันทึกแล้ว']");
    const probe = document.createElement("i"); probe.style.color = "var(--ok-ink)"; document.body.append(probe); const want = getComputedStyle(probe).color; probe.remove();
    return { stroke: sv?.getAttribute("stroke"), color: sv ? getComputedStyle(sv).color : null, want };
  });
  check("72 ติ๊กบันทึกแล้วในแถวใช้สีจากตัวแปรโทน ไม่ใช่รหัสสีตายตัว", r.stroke === "currentColor" && r.color === r.want, JSON.stringify(r));
};
T[73] = async (p, check) => {
  await nav(p, "จับคู่ปก"); await wait(p, 400); await click(p, "[data-link-goboard]").catch(() => {}); await wait(p, 500);
  await over(p, "link_add_images", `throw "ไดรฟ์ C เต็ม";`);
  await over(p, "link_state", `throw "อ่านไฟล์สถานะไม่ได้";`);
  await pick(p, "D:\\รูปปก\\รูปใหม่.jpg");
  await p.evaluate(() => [...document.querySelectorAll(".addbtn")].find((b) => b.innerText.includes("รูป") && !b.dataset.boardAddImages)?.click()); await wait(p, 600);
  const t = await toastText(p);
  check("73 เพิ่มรูปไม่สำเร็จแล้วอ่านสถานะซ้ำก็ล้ม ขึ้นแถบแดงทั้งสองเรื่อง ไม่หลุดเงียบ", t.includes("มีไฟล์ที่ไม่รับ") && t.includes("อ่านสถานะกระดานไม่สำเร็จ"), t);
};
T[79] = async (p, check) => {
  await over(p, "font_info", `return { path: a.path, file: "Sarabun-Bold.ttf", names: ["Sarabun Bold"], size: 90000 };`);
  await nav(p, "เสียงและซับ"); await wait(p, 300);
  await p.evaluate((x) => window.__emit("tauri://drag-drop", { paths: [x], position: { x: 700, y: 400 } }), MOVIE); await wait(p, 1500);
  const before = await text(p, "[data-summary]");
  await p.evaluate(() => window.__emit("tauri://drag-drop", { paths: ["D:\\ฟอนต์\\Sarabun-Bold.ttf"], position: { x: 700, y: 400 } })); await wait(p, 800);
  const after = await text(p, "[data-summary]");
  check("79 ลากฟอนต์มาฝังอย่างเดียว แถบสรุปบอกว่าฝังฟอนต์เพิ่ม ไม่บอกว่าเหมือนไฟล์เดิม", before?.includes("เหมือนไฟล์เดิม") && after?.includes("ฝังฟอนต์เพิ่ม 1 ไฟล์") && !after.includes("เหมือนไฟล์เดิม"), `${before} → ${after}`);
};
T[81] = async (p, check) => {
  await nav(p, "เสียงและซับ"); await wait(p, 300);
  await p.evaluate((x) => window.__emit("tauri://drag-drop", { paths: [x], position: { x: 700, y: 400 } }), MOVIE); await wait(p, 1500);
  const subRow = async () => { if (await p.$("[data-main-panel]")) return; await p.evaluate(() => { const r = [...document.querySelectorAll("[data-trk]")].find((x) => /SRT|ASS|PGS|ซับ/.test(x.innerText) && x.querySelector("[data-trk-kind=subtitle], .ksub") !== null) ?? [...document.querySelectorAll("[data-trk]")].reverse().find((x) => /SRT|ASS|PGS/.test(x.innerText)); r?.click(); }); await wait(p, 400); };
  await subRow();
  const mkv = await p.evaluate(() => document.querySelector("[data-main-panel]")?.parentElement?.innerText ?? "");
  await clickText(p, "MP4", "button,[role=tab],[role=radio]").catch(() => {}); await wait(p, 400);
  await subRow();
  const mp4 = await p.evaluate(() => document.querySelector("[data-main-panel]")?.parentElement?.innerText ?? "");
  if (process.env.SHOTS) await (await p.$("[data-main-panel]"))?.evaluate((e) => e.parentElement.scrollIntoView({ block: "center" }));
  check("81 คำอธิบายซับหลักของ MKV ยังบอกว่าไม่เลือกแล้วเปิดแบบไม่มีซับ", mkv.includes("เปิดแบบไม่มีซับ"), mkv);
  check("81 เลือกไฟล์ที่ได้เป็น MP4 คำอธิบายบอกว่าโปรแกรมเล่นจะเปิดซับแรกให้เอง", mp4.includes("MP4") && mp4.includes("ซับแรก") && !mp4.includes("เปิดแบบไม่มีซับ"), mp4);
};

// ชุด 4 ----------------------------------------------------------------
/** หน้าเสียงและซับ ใส่หนังทดสอบ */
const avMovie = async (p) => {
  await nav(p, "เสียงและซับ"); await wait(p, 300);
  await p.evaluate((x) => window.__emit("tauri://drag-drop", { paths: [x], position: { x: 700, y: 400 } }), MOVIE); await wait(p, 1500);
};
const avDrop = (p, path) => p.evaluate((x) => window.__emit("tauri://drag-drop", { paths: [x], position: { x: 700, y: 400 } }), path);
T[80] = async (p, check) => {
  const r = await mod(p, "/src/pages/av/useAvSummary.ts", `
    const t = (convert, extra = {}) => ({ duration: 1000, channels: 6, rate: 48000, bytes: 500e6, bitrate: null, convert, ...extra });
    return { flac: m.convBytes(t({ codec: "flac", channels: 2, rate: 48000, p: {} })), opus: m.convBytes(t({ codec: "opus", p: { bitrate: 160 } })),
      nob: m.convBytes(t({ codec: "aac", p: {} })), speed: m.convBytes(t({ codec: "opus", speed: [25, 24], p: { bitrate: 160 } })),
      none: m.convBytes(t(null)), raw: m.rawBytes(t(null, { bytes: null, bitrate: 640000 })) };`);
  check("80 ขนาดเสียงหลังแปลงคิดสูตรเดียวกับ conv_estimate ฝั่ง Rust", Math.round(r.flac) === 172800000 && r.opus === 20000000 && r.nob === 40000000 && Math.round(r.speed) === Math.round(1000 * 25 / 24 * 20000) && r.none === null && r.raw === 80000000, JSON.stringify(r));
  const src = await SRC("src/pages/av/useAvSummary.ts");
  check("80 ขนาดที่คาดข้างปุ่มรวมใช้ขนาดหลังแปลง และไม่มีบรรทัด addedBytes ที่ได้ศูนย์เสมอ", src.includes("convBytes(t)") && !src.includes("const addedBytes"));
};
T[82] = async (p, check) => {
  await avMovie(p);
  await clickText(p, "MP4"); await wait(p, 300);
  // ลากรูปแรกนอกช่องปก การ์ดโปสเตอร์เปิด (รูปลงช่องปกตั้ง) แล้วลากรูปที่สองลงช่องปกนอนตรง ๆ
  await avDrop(p, "D:\\รูปปก\\ปกตั้ง.jpg"); await p.waitForSelector("[data-use]", { timeout: 5000 }); await wait(p, 300);
  await click(p, "[data-use]"); await p.waitForSelector("[data-drop=cover_land]", { timeout: 5000 }); await wait(p, 300);
  await p.evaluate(() => document.querySelector("[data-drop=cover_land]").scrollIntoView({ block: "center" })); await wait(p, 300);
  await p.evaluate(() => { const r = document.querySelector("[data-drop=cover_land]").getBoundingClientRect(); window.__emit("tauri://drag-drop", { paths: ["D:\\รูปปก\\ปกนอน.jpg"], position: { x: (r.left + r.width / 2) * devicePixelRatio, y: (r.top + r.height / 2) * devicePixelRatio } }); });
  await p.waitForSelector("[data-use]", { timeout: 5000 }); await wait(p, 300); await click(p, "[data-use]"); await wait(p, 900);
  if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/ข้อ-82-ปกนอน.png` });
  const w = await text(p, "[data-mp4land]");
  check("82 เลือก MP4 แล้วใส่ปกนอนใหม่ ขึ้นคำเตือนก่อนรวมว่า MP4 เก็บได้แค่ปกตั้ง", !!w && w.includes("ปกตั้ง"), w);
  const src = await SRC("src/pages/av/useAvSummary.ts");
  check("82 ปกนอนใน MP4 ไม่นับเป็นของเปลี่ยนในแถบสรุป", src.includes(`(output !== "mp4" && covers.cover_land.mode !== "keep")`) && src.includes("|| coverCounts ||"));
  await clickText(p, "MKV (แนะนำ)"); await wait(p, 300);
  check("82 กลับเป็น MKV คำเตือนปกนอนหาย", (await p.$("[data-mp4land]")) === null);
};
T[83] = async (p, check) => {
  await nav(p, "ตั้งค่า"); await p.waitForSelector("[data-setnav=poster]"); await click(p, "[data-setnav=poster]"); await wait(p, 300);
  await click(p, "[role=switch][aria-label='ตรวจไฟล์ใหม่หลังครอบเสร็จ']"); await wait(p, 300);
  await avMovie(p);
  await clickText(p, "ลบไฟล์เดิมหลังตรวจผ่าน", "[role=radio]"); await wait(p, 200);
  await clickText(p, "รวมเข้าไฟล์หนัง"); await wait(p, 400);
  const d1 = await text(p, ".dlg");
  check("83 ปิดการตรวจไฟล์ใหม่ไว้ หน้าต่างยืนยันบอกว่าไฟล์เดิมไปโฟลเดอร์ไฟล์เดิม ไม่ลงถังขยะ", !!d1 && d1.includes("ปิดการตรวจไฟล์ใหม่") && d1.includes("โฟลเดอร์ไฟล์เดิม") && !d1.includes("ถังขยะของ Windows"), d1);
  await clickText(p, "ถัดไป"); await wait(p, 300);
  const d2 = await text(p, ".dlg");
  check("83 ขั้นที่ 2 บอกว่าย้ายไปโฟลเดอร์ไฟล์เดิม ไม่บอกว่ากู้จากถังขยะได้", !!d2 && d2.includes("ย้ายไฟล์เดิม") && !d2.includes("ถังขยะ"), d2);
  await clickText(p, "ย้อนกลับ"); await wait(p, 200); await clickText(p, "ยกเลิก"); await wait(p, 200);
};
T[85] = async (p, check) => {
  await avMovie(p);
  await avDrop(p, "D:\\หนัง\\ดาวเหนือ (2023).th.srt"); await wait(p, 800);
  await click(p, "[data-mode=pair]"); await wait(p, 300);
  await over(p, "pair_set", `window.__pairs = (window.__pairs ?? 0) + 1; await new Promise((ok) => setTimeout(ok, 1500)); return (await window.__TAURI_INTERNALS__.invoke("get_library")).movies[0];`);
  await click(p, "[data-pair-save]"); await wait(p, 150); await click(p, "[data-pair-save]"); await wait(p, 150);
  const r = await p.evaluate(() => { const b = document.querySelector("[data-pair-save]"); return { txt: b.innerText.trim(), dis: b.getAttribute("aria-disabled"), n: window.__pairs }; });
  check("85 กดจับคู่แล้วปุ่มขึ้นว่ากำลังจับคู่ กดซ้ำไม่บันทึกซ้ำ", r.txt === "กำลังจับคู่…" && r.dis === "true" && r.n === 1, JSON.stringify(r));
  await wait(p, 1700);
  const done = await p.evaluate(() => ({ txt: document.querySelector("[data-pair-save]").innerText.trim(), ok: !!document.querySelector("[data-paired-ok]") }));
  check("85 บันทึกเสร็จปุ่มกลับเป็นจับคู่ไว้กับหนังเรื่องนี้ การ์ดผลขึ้น", done.txt === "จับคู่ไว้กับหนังเรื่องนี้" && done.ok, JSON.stringify(done));
};
T[86] = async (p, check) => {
  await avMovie(p);
  await over(p, "merge_add_file", `const r = await window.__fxOverBase.merge_add_file(a); const idx = String(a.path).replace(/\\.sub$/i, ".idx"); return { ...r, path: idx, name: idx.split("\\\\").pop(), ext: "idx", tracks: r.tracks.map((t) => ({ ...t, src: idx, codec: "dvd_subtitle" })) };`);
  const rows = () => p.evaluate(() => document.querySelectorAll("[data-trk]").length);
  const n0 = await rows();
  await avDrop(p, "D:\\หนัง\\ซับดีวีดี.sub"); await wait(p, 800);
  const n1 = await rows();
  await avDrop(p, "D:\\หนัง\\ซับดีวีดี.sub"); await wait(p, 800);
  const n2 = await rows();
  const t = await toastText(p);
  check("86 ลากซับ .sub เดิมซ้ำ ไม่ได้สองแถว ขึ้นแถบว่าเพิ่มไว้แล้ว", n1 === n0 + 1 && n2 === n1 && t.includes("เพิ่มไว้แล้ว"), `${n0} → ${n1} → ${n2} ${t}`);
  const src = await SRC("src/pages/av/useAvFiles.ts");
  check("86 งานเพิ่มไฟล์ไม่ทับสถานะกำลังอ่านไฟล์หนัง", src.includes(`setLoading((l) => (l === "movie" ? l : "add"))`) && src.includes(`setLoading((l) => (l === "add" ? null : l))`));
};
T[95] = async (p, check) => {
  await avMovie(p);
  await click(p, "[data-mode=extract]"); await wait(p, 300);
  await p.evaluate(() => [...document.querySelectorAll("[data-trk]")].find((r) => /AC-3|TrueHD|AAC|เสียง/.test(r.innerText))?.click()); await wait(p, 400);
  const r = await p.evaluate(() => {
    const d = document.querySelector(".avdetail"); if (!d) return null;
    const delay = d.querySelector("[data-find-delay]"), name = d.querySelector("input[aria-label='ชื่อแทร็ก']"), main = d.querySelector("[data-main-panel]");
    return { delay: delay ? [delay.getAttribute("aria-disabled"), delay.title] : null, name: name?.readOnly, main: main?.className };
  });
  check("95 วิธีแยก ส่วนตั้งค่าแทร็กล็อกช่องพร้อมเหตุผลเดียวกับแถว", r === null || (r.name === true && (!r.delay || (r.delay[0] === "true" && r.delay[1].includes("ตอนแยก"))) && (!r.main || r.main.includes("off"))), JSON.stringify(r));
  await click(p, "[data-mode=merge]"); await wait(p, 300);
  const back = await p.evaluate(() => document.querySelector(".avdetail input[aria-label='ชื่อแทร็ก']")?.readOnly);
  check("95 กลับวิธีรวม ช่องแก้ได้เหมือนเดิม", back === false, back);
};

// ชุด 5 ----------------------------------------------------------------
T[16] = async (p, check) => {
  const r = await mod(p, "/src/lib/codecAdv.ts", `
    const keys = (eng, v) => m.cardsFor("aac", eng, v).map((k) => k.key + (k.eng ? "@" + k.eng.join("/") : ""));
    const tvbr = { mode: "TVBR", tvbr: 109, bitrate: 465 }, cvbr = { mode: "CVBR", bitrate: 96, tvbr: 45 };
    return { ff: keys("ffmpeg", tvbr), fdkT: keys("fdkaac", tvbr), fdkC: keys("fdkaac", cvbr), qaac: keys("qaac", tvbr),
      evFdk: m.engVals("aac", "fdkaac", cvbr).mode, evFdkT: m.engVals("aac", "fdkaac", tvbr).mode, evFf: "mode" in m.engVals("aac", "ffmpeg", tvbr),
      opusSame: JSON.stringify(m.cardsFor("opus", "native", { bitrate: 160 }).map((k) => k.key)) === JSON.stringify(m.cardsFor("opus", "native", m.engVals("opus", "native", { bitrate: 160 })).map((k) => k.key)) };`);
  check("16 AAC ด้วย ffmpeg ชุดค่า TVBR ยังเห็นการ์ดบิตเรต ส่งบิตเรตของชุดถึงตัวแปลง", r.ff.includes("bitrate") && !r.evFf, JSON.stringify(r.ff));
  check("16 fdkaac ชุด TVBR ใช้ VBR และเห็นการ์ดระดับ VBR · ชุด CVBR ใช้ CBR บิตเรตเดียวกัน", r.evFdkT === "VBR" && r.fdkT.some((k) => k.startsWith("vbr")) && r.evFdk === "CBR" && r.fdkC.includes("bitrate"), JSON.stringify(r));
  check("16 qaac ชุด TVBR เหมือนเดิม มีการ์ดระดับ TVBR ไม่มีการ์ดบิตเรต", r.qaac.some((k) => k.startsWith("tvbr")) && !r.qaac.includes("bitrate") && r.opusSame, JSON.stringify(r.qaac));
};
T[90] = async (p, check) => {
  const r = await mod(p, "/src/lib/codecs.ts", `
    const L = (pp) => m.convertLabel({ codec: "mp3", encoder: "native", p: pp, channels: null, bits: null, rate: null });
    return [L({ mode: "ABR", bitrate: 192 }), L({ mode: "CBR", bitrate: 320 }), L({ mode: "VBR", vbrq: 0 })];`);
  check("90 MP3 แบบ ABR ป้ายขึ้น ABR พร้อมบิตเรต ไม่ใช่ V2", r[0] === "MP3 ABR 192" && r[1] === "MP3 CBR 320" && r[2] === "MP3 V0", JSON.stringify(r));
};
T[93] = async (p, check) => {
  const r = await mod(p, "/src/components/SubViewer.tsx", `return [m.cpsChars("ที่นี่ไม่มีใครรู้"), m.cpsChars("น้ำใจ ไม่เคยเปลี่ยน"), m.cpsChars("Hello world")];`);
  check("93 นับตัวอักษรต่อวินาทีไม่นับสระบนล่าง วรรณยุกต์ และเว้นวรรค", r[0] === 9 && r[1] === 14 && r[2] === 10, JSON.stringify(r));
  // ตัวดูซับตัวหนังสือยังวาดตารางได้หลังย้ายไป components/subviewer/ (ชุด 6 แบ่งไฟล์)
  await avMovie(p); await clickText(p, "ดูซับ"); await p.waitForSelector("[data-sub-table] tbody tr", { timeout: 6000 });
  const rows = await p.evaluate(() => document.querySelectorAll("[data-sub-table] tbody tr").length);
  check("93 ตัวดูซับตัวหนังสือเปิดจากหน้าเสียงและซับได้ ตารางมีบรรทัด", rows > 0, rows);
};
T[94] = async (p, check) => {
  const r = await mod(p, "/src/lib/ftypes.tsx", `return { dvbName: m.ftName("subtitle", "dvb_subtitle"), dvbBmp: m.isBitmapSub("dvb_subtitle"), dvbConv: m.isImageSub("dvb_subtitle"), xsub: m.isBitmapSub("xsub"), pgs: [m.isBitmapSub("hdmv_pgs_subtitle"), m.isImageSub("hdmv_pgs_subtitle")], srt: m.isBitmapSub("subrip") };`);
  check("94 ซับ DVB กับ XSUB นับเป็นซับรูปของตัวดูซับ ปุ่มแปลงยังเฉพาะชนิดที่เครื่องมือแปลงรองรับ", r.dvbName === "DVB" && r.dvbBmp && !r.dvbConv && r.xsub && r.pgs[0] && r.pgs[1] && !r.srt, JSON.stringify(r));
  const t = await mod(p, "/src/pages/av/parts.tsx", `return m.rowText({ kind: "subtitle", codec: "dvb_subtitle", profile: null, inMovie: true, frames: 120, src: "", lang: "tha", name: "", channels: null, bitrate: null, bytes: null }, 1).parts.join(" | ");`);
  check("94 แถวซับ DVB บอกว่าเป็นซับทีวีดิจิทัลแบบรูป นับเป็นแพ็กเก็ต", t.includes("ซับทีวีดิจิทัลแบบรูป") && t.includes("แพ็กเก็ต") && !t.includes("ตัวหนังสือ"), t);
};
T[96] = async (p, check) => {
  await over(p, "merge_inspect", `const r = await window.__fxOverBase.merge_inspect(a); return { ...r, attachments: [...r.attachments, { id: 9, name: "Sarabun-Bold.ttf", mime: "font/ttf", size: 90000 }] };`);
  await avMovie(p);
  const mkv = await p.$("[data-mp4attach]");
  await clickText(p, "MP4"); await wait(p, 300);
  const w = await text(p, "[data-mp4attach]");
  check("96 เลือก MP4 ตอนหนังมีไฟล์แนบ ขึ้นคำเตือนก่อนรวมว่าไฟล์แนบจะไม่อยู่ในไฟล์ใหม่ MKV ไม่ขึ้น", mkv === null && !!w && w.includes("ไฟล์แนบ 1 ไฟล์"), w);
  const src = await SRC("src/pages/av/TrackTable.tsx") + await SRC("src/pages/av/PosterCard.tsx");
  check("96 แถวไฟล์แนบกับคำใต้การ์ดโปสเตอร์ตอน MP4 บอกว่าไม่ติดไป", src.includes("MP4 เก็บไฟล์แนบไม่ได้ ไฟล์นี้จะไม่ติดไป") && src.includes("จะไม่ติดไป เพราะ MP4 เก็บไฟล์แนบไม่ได้"));
};
T[97] = async (p, check) => {
  const src = await SRC("src/pages/av/DelayDialog.tsx"), rs = await SRC("src-tauri/src/audio/delay.rs");
  const m = /const MARGIN: f64 = ([\d.]+);/.exec(rs);
  check("97 ผลหาไม่เจอบอกว่าค้นได้ไม่เกินบวกลบ 5 วินาที ตรงกับระยะค้นฝั่ง Rust", src.includes("ค้นได้ไม่เกินบวกลบ 5 วินาที") && m && Number(m[1]) === 5, m?.[1]);
};

// ชุด 6 ----------------------------------------------------------------
const SONG = "D:\\เพลง\\เพลงตัวอย่าง.flac";
/** หน้ากราฟเสียงที่จอ 1920 × 1032 หัวกราฟกว้างพอให้ปุ่มเป็นแถว ไม่เป็นดรอปดาวน์ */
const graphOpen = async (p, path) => { await p.setViewportSize({ width: 1920, height: 1032 }); await nav(p, "กราฟเสียง"); await wait(p, 300); await avDrop(p, path); await p.waitForSelector("[data-plot]", { timeout: 15000 }); await wait(p, 800); };
T[19] = async (p, check) => {
  // แกนเวลาแบบไม้บรรทัด ตำแหน่งอยู่ที่ขีด i ตัวแม่ของ span · ตัววาดรูปต้องวาดเลขทุกตัวที่มีตำแหน่ง
  const n = await mod(p, "/src/pages/graph/draw.tsx", `
    const r = document.createElement("div"); r.innerHTML = '<i class="tk" style="left: 25%"><span>0:30</span></i><i class="tk" style="left: 75%"><span>1:30</span></i><i class="tk" style="left: 1%"></i>';
    document.body.append(r); const got = [];
    const g = { fillText: (t, x) => got.push([t, x]), set fillStyle(v) {}, set font(v) {}, set textAlign(v) {}, set textBaseline(v) {} };
    m.drawRuler(g, r, 100, 400, 10); r.remove(); return got;`);
  check("19 รูปกราฟที่บันทึกวาดเลขเวลาใต้กราฟจากตำแหน่งของขีด ครบทุกตัวที่มีเลข", n.length === 2 && n[0][0] === "0:30" && n[0][1] === 200 && n[1][1] === 400, JSON.stringify(n));
  // หน้าจริง แกนเวลาของรูปคลื่นมีเลขที่ตัววาดอ่านได้
  await graphOpen(p, MOVIE);
  const real = await p.evaluate(() => [...document.querySelectorAll(".tk span")].filter((s) => !Number.isNaN(parseFloat(s.style.left || s.parentElement.style.left))).length);
  check("19 แกนเวลาบนหน้ากราฟจริงมีเลขที่ตัววาดรูปอ่านตำแหน่งได้", real > 2, real);
};
T[20] = async (p, check) => {
  await graphOpen(p, SONG); await click(p, "[data-view=loud]"); await wait(p, 600);
  await clickText(p, "L ซ้าย"); await wait(p, 600);
  const before = await p.evaluate(() => [...document.querySelectorAll(".loudseg button.on, [data-loudmode] button.on, button.on")].map((b) => b.innerText.trim()).find((t) => ["รวมทุกช่อง", "L ซ้าย", "R ขวา", "เทียบซ้ายขวา"].includes(t)));
  await avDrop(p, MOVIE); await p.waitForSelector("[data-plot]"); await wait(p, 1500);
  const after = await p.evaluate(() => [...document.querySelectorAll("button.on")].map((b) => b.innerText.trim()).find((t) => ["รวมทุกช่อง", "L ซ้าย", "R ขวา", "เทียบซ้ายขวา"].includes(t)));
  check("20 ดูความดังแบบ L ไว้แล้วเปิดไฟล์อื่น กลับเป็นรวมทุกช่อง", before === "L ซ้าย" && after === "รวมทุกช่อง", `${before} → ${after}`);
  const src = await SRC("src/pages/graph/graphPlot.tsx");
  check("20 ช่องที่เลือกไม่มีในไฟล์ ใช้รวมทุกช่อง ไม่ส่งช่องที่ไม่มีให้กราฟ", src.includes("const loudLive =") && src.includes('loudLive !== "mix"') && !src.includes('view === "loud" && loudMode !== "mix"'));
};
T[99] = async (p, check) => {
  await graphOpen(p, MOVIE); await click(p, "[data-view=wave]").catch(() => {}); await wait(p, 400);
  await clickText(p, "30 วินาที"); await wait(p, 300);
  await p.evaluate(() => [...document.querySelectorAll("[data-vz], [data-vz] button")].find((b) => b.tagName === "BUTTON" && b.innerText.trim() === "4×")?.click()); await wait(p, 300);
  const z0 = await p.evaluate(() => ({ zoom: [...document.querySelectorAll("button.on")].map((b) => b.innerText.trim()).find((t) => ["ทั้งไฟล์", "10 นาที", "4 นาที", "30 วินาที"].includes(t)), vz: document.querySelector("button[data-vz].on, [data-vz] button.on")?.innerText.trim() }));
  await avDrop(p, SONG); await p.waitForSelector("[data-plot]"); await wait(p, 1500);
  const z1 = await p.evaluate(() => ({ zoom: [...document.querySelectorAll("button.on")].map((b) => b.innerText.trim()).find((t) => ["ทั้งไฟล์", "10 นาที", "4 นาที", "30 วินาที"].includes(t)), vz: document.querySelector("button[data-vz].on, [data-vz] button.on")?.innerText.trim() }));
  check("99 เปิดไฟล์ใหม่ ซูมกลับเป็นทั้งไฟล์ และขยายแนวตั้งกลับเป็น 1 เท่า", z0.zoom === "30 วินาที" && z0.vz === "4×" && z1.zoom === "ทั้งไฟล์" && z1.vz === "1×", JSON.stringify({ z0, z1 }));
};
T[100] = async (p, check) => {
  await graphOpen(p, MOVIE); await click(p, "[data-view=wave]").catch(() => {}); await wait(p, 400);
  const box = await (await p.$("[data-plot]")).boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height * 0.55); await wait(p, 300);
  const t = await p.evaluate(() => document.querySelector(".tip .r")?.innerText ?? "");
  check("100 ชี้รูปคลื่น กล่องค่าบอกว่าเป็นดังเฉลี่ย", t.includes("ดังเฉลี่ย") && /dB/.test(t), t);
};
T[101] = async (p, check) => {
  const gp = await SRC("src/pages/graph/graphPlot.tsx"), dr = await SRC("src/pages/graph/draw.tsx"), zm = await SRC("src/pages/graph/zoom.tsx"), pa = await SRC("src/pages/graph/parts.tsx"), cm = await SRC("src/pages/graph/common.tsx");
  const vzMin = /VZ_MIN = ([\d.]+)/.exec(zm)?.[1];
  const rtAbove = /ช่วงเวลาบนหัวกราฟ[^]*?\*\/\s*export function RangeTime/.test(cm) && !/ช่วงเวลาบนหัวกราฟ[^]*?\*\/\s*\/\*\* ความสูงแถบต่ำสุด/.test(cm);
  const parts101 = [gp.includes("// 252 คือหัวกราฟ"), !dr.includes("0.25 ถึง 8"), !zm.includes("สเกลล็อก 0.25"), dr.includes(`${vzMin} ถึง 8`), pa.includes("ช่วง 120 dB ได้ 10 เส้น"), rtAbove];
  check("101 คอมเมนต์ตรงค่าจริง 252 ช่วงขยายแนวตั้งตาม VZ_MIN จำนวนเส้นแกนตั้ง และคำอธิบาย RangeTime อยู่เหนือตัวมันเอง", parts101.every(Boolean), JSON.stringify(parts101));
};
T[102] = async (p, check) => {
  // นับตัววัดขนาดที่สร้างระหว่างเลื่อนเมาส์บนกราฟ ไม่ควรสร้างใหม่ทุกครั้งที่หน้าวาดใหม่
  // นับเฉพาะตัววัดที่เฝ้ากรอบกราฟ (div.plot data-plot) ตามที่ข้อนี้พูดถึง · แคนวาสที่ถูกสร้างใหม่ตอนชี้เป็นอีกเรื่อง
  await p.evaluate(() => { const R = window.ResizeObserver; window.__roN = 0; window.ResizeObserver = class extends R { observe(el, o) { if (el?.matches?.("[data-plot]")) window.__roN++; return super.observe(el, o); } }; });
  await graphOpen(p, MOVIE); await click(p, "[data-view=wave]").catch(() => {}); await wait(p, 500);
  const box = await (await p.$("[data-plot]")).boundingBox();
  const n0 = await p.evaluate(() => window.__roN);
  for (let i = 0; i < 20; i++) { await p.mouse.move(box.x + 160 + i * 25, box.y + box.height * 0.55); await wait(p, 40); }
  await wait(p, 300);
  const n1 = await p.evaluate(() => window.__roN);
  check("102 เลื่อนเมาส์บนกราฟ 20 ครั้ง ไม่ติดตัววัดขนาดกรอบกราฟใหม่ทุกครั้งที่หน้าวาดใหม่", n1 - n0 === 0 && n0 >= 1, `${n0} → ${n1}`);
};

// ชุด 7 ----------------------------------------------------------------
T[103] = async (p, check) => {
  // ความถี่เฉลี่ยแบบซ้อนทุกช่อง เสียงหึ่ง 50 100 150 Hz เฉพาะเส้นที่ 3 (FC) เส้นอื่นเรียบ
  await over(p, "graph_psd", `const r = await window.__fxOverBase.graph_psd(a); const bin = r.rate / r.size;
    r.db = r.db.map((d, k) => d.map((v, i) => { const f = i * bin; const flat = -60 - f / 1000; if (k !== 2 || a.series.length < 2) return flat; return [50, 100, 150].some((h) => Math.abs(f - h) < bin * 0.6) ? -20 : flat; }));
    return r;`);
  await graphOpen(p, MOVIE); await click(p, "[data-view=psd]"); await wait(p, 1200);
  await p.evaluate(() => [...document.querySelectorAll(".psdch-seg button")].find((b) => b.innerText.includes("ซ้อน"))?.click()); await wait(p, 1500);
  const r = await p.evaluate(() => ({ mode: document.querySelector(".psdch-seg button.on")?.innerText, hum: !!document.querySelector("[data-psdcheck=hum]") }));
  check("103 ซ้อนทุกช่อง เสียงหึ่งเฉพาะช่องกลางยังเจอ ไม่ดูแค่เส้นแรก", r.hum && /ซ้อน/.test(r.mode ?? ""), JSON.stringify(r));
};
T[104] = async (p, check) => {
  await over(p, "graph_cancel", `window.__gcancel = (window.__gcancel ?? 0) + 1; return null;`);
  await over(p, "graph_overview", `await new Promise((ok) => setTimeout(ok, 8000)); return await window.__fxOverBase.graph_overview(a);`);
  await graphOpen(p, MOVIE).catch(() => {});
  // ไฟล์ที่สองส่งผ่าน __cmpPick ไม่เปิดกล่องเลือกไฟล์ (useGraphActions compareOther) · ภาพรวมจำลองให้อ่านนาน 8 วินาที
  await p.evaluate((x) => { window.__cmpPick = x; }, SONG);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "เทียบ")?.click()); await p.waitForSelector("[data-cmpstop]", { timeout: 6000 }).catch(() => {});
  const stop = await p.$("[data-cmpstop]");
  if (stop) { await stop.click(); await wait(p, 200); }
  const n1 = await p.evaluate(() => window.__gcancel ?? 0);
  if (await p.$("[data-cmpback]")) { await click(p, "[data-cmpback]"); await wait(p, 300); }
  const n2 = await p.evaluate(() => window.__gcancel ?? 0);
  const src = await SRC("src/pages/graph/cmpBody.tsx") + await SRC("src/pages/graph/useCmpView.tsx");
  check("104 หน้ารอของการเทียบมีปุ่มหยุด และกดกลับระหว่างอ่านสั่งหยุดอ่าน", src.includes("data-cmpstop") && src.includes("if (!ready) void graphApi.cancel(); onBack();") && !!stop && n1 >= 1 && n2 >= 2, `ปุ่ม ${!!stop} หยุด ${n1} กลับ ${n2}`);
};
T[111] = async (p, check) => {
  const r = await mod(p, "/src/pages/graph/draw.tsx", `
    const mk = (bg, fg) => { const c = document.createElement("canvas"); c.width = 100; c.height = 100; const g = c.getContext("2d"); g.fillStyle = bg; g.fillRect(0, 0, 100, 100); g.fillStyle = fg; g.fillRect(10, 10, 30, 10); return c; };
    const o = { transparent: true, format: "png" };
    const dark = mk("#000000", "#ffffff"), light = mk("#ffffff", "#000000");
    const d2 = m.alphaOf(dark, o), l2 = m.alphaOf(light, o);
    const al = (c, x, y) => c.getContext("2d").getImageData(x, y, 1, 1).data[3];
    return { darkSame: d2 === dark, darkText: al(d2, 20, 15), lightBg: al(l2, 80, 80), lightText: al(l2, 20, 15) };`);
  check("111 กราฟพื้นมืดเก็บพื้นทึบ ตัวหนังสือขาวไม่เป็นรูใส · กราฟพื้นสว่างพื้นยังใส", r.darkSame && r.darkText === 255 && r.lightBg === 0 && r.lightText === 255, JSON.stringify(r));
};
T[117] = async (p, check) => {
  const r = await mod(p, "/src/pages/graph/TagDialog.tsx", `
    const f = (audioOnly) => ({ audioOnly, tags: [{ key: "title", value: "ดาวเหนือ" }], cover: null });
    return { movie: m.tagRows(f(false), null)[0][0], song: m.tagRows(f(true), null)[0][0] };`);
  check("117 ข้อมูลในไฟล์ของหนังขึ้นแถวชื่อเรื่อง เพลงยังเป็นชื่อเพลง", r.movie === "ชื่อเรื่อง" && r.song === "ชื่อเพลง", JSON.stringify(r));
  const src = await SRC("src/pages/graph/TagDialog.tsx");
  check("117 หัวหน้าต่างของไฟล์หนังเขียนว่าข้อมูลในไฟล์ของ", src.includes(`f && !f.audioOnly ? "ข้อมูลในไฟล์ของ" : "ข้อมูลเพลงของ"`));
};
T[26] = async (p, check) => {
  await nav(p, "บิตเรต"); await wait(p, 300); await pick(p, MOVIE); await clickText(p, "เลือกไฟล์จากเครื่อง");
  await p.waitForFunction(() => window.__brDone === true, null, { timeout: 15000 }); await wait(p, 300);
  const t = await text(p, "[data-brn-ceilsrc]");
  check("26 ป้ายเพดานบอกว่าคิดจากทั้งไฟล์ ไม่บอกว่าเฉลี่ยคูณสองซึ่งไม่ตรงค่าเฉลี่ยในแถวบน", t === "(ทั้งไฟล์ × 2)", t);
  const src = await SRC("src/pages/bitrate/common.tsx");
  check("26 กล่อง ⓘ เส้นเพดานบอกว่ารวมเสียงและซับทุกแทร็ก และปัดเป็น 1 2 5", src.includes("ทั้งไฟล์ × 2") && src.includes("รวมเสียงกับซับทุกแทร็ก"));
};
T[24] = async (p, check) => {
  await over(p, "convert_probe", `window.__pn = (window.__pn ?? 0) + 1; window.__pmax = Math.max(window.__pmax ?? 0, window.__pn); await new Promise((ok) => setTimeout(ok, 120)); window.__pn--; return await window.__fxOverBase.convert_probe(a);`);
  await nav(p, "กราฟเสียง"); await wait(p, 300); await click(p, "[data-gmode=convert]"); await wait(p, 400);
  const paths = Array.from({ length: 30 }, (_, i) => `D:\\เพลง\\เพลงที่ ${i + 1}.flac`);
  await p.evaluate((ps) => window.__emit("tauri://drag-drop", { paths: ps, position: { x: 900, y: 400 } }), paths);
  await wait(p, 3000);
  const r = await p.evaluate(() => ({ max: window.__pmax ?? 0, rows: document.querySelectorAll("[data-qrow], .qrow, [data-qitem]").length }));
  check("24 ลากเพลง 30 ไฟล์ อ่านข้อมูลไฟล์พร้อมกันไม่เกิน 3 ไฟล์", r.max >= 1 && r.max <= 3, JSON.stringify(r));
};

// ชุด 8 ----------------------------------------------------------------
const HASHES = `return { md5: "a".repeat(32), sha1: null, sha256: "b".repeat(64), crc32: "cccccccc", sha512: null, bytes: 1000, seconds: 2 };`;
const hashStart = (p) => p.evaluate(() => [...document.querySelectorAll("[data-hash] button")].find((b) => b.classList.contains("btn-main") && !b.dataset.hashRedo)?.click());
T[31] = async (p, check) => {
  await over(p, "hash_file", HASHES);
  await nav(p, "MediaInfo"); await wait(p, 300);
  await avDrop(p, "D:\\ดาวน์โหลด\\หนังที่ยังไม่ขึ้นชั้น.mkv"); await wait(p, 1200);
  await hashStart(p); await wait(p, 600);
  const out = await text(p, "[data-hash]");
  await avDrop(p, MOVIE); await wait(p, 1200);
  await hashStart(p); await wait(p, 600);
  const inn = await text(p, "[data-hash]");
  check("31 ไฟล์นอกชั้นวางไม่บอกว่าจำค่า SHA-256 ไว้ เรื่องบนชั้นวางยังบอก", !!out && out.includes("คำนวณเมื่อ") && !out.includes("ถูกจำไว้") && !!inn && inn.includes("ถูกจำไว้"), `${out?.slice(0, 80)} | ${inn?.slice(0, 80)}`);
};
T[32] = async (p, check) => {
  await over(p, "hash_file", HASHES);
  await nav(p, "MediaInfo"); await wait(p, 300); await avDrop(p, MOVIE); await wait(p, 1200);
  await p.evaluate(() => window.__applyTone("night")); await wait(p, 400);
  const bg = () => p.evaluate(() => getComputedStyle(document.querySelector("[data-hash]")).backgroundColor);
  const b0 = await bg();
  // ให้หน้ามีของเพิ่มลดหลายรอบ ตัวแปลงโทนวาดซ้ำทุกรอบ
  for (let i = 0; i < 3; i++) { await p.evaluate(() => { const d = document.createElement("div"); d.style.color = "#123456"; document.querySelector("#root").append(d); setTimeout(() => d.remove(), 50); }); await wait(p, 250); }
  const b1 = await bg();
  await p.evaluate(() => window.__applyTone("quartz")); await wait(p, 400);
  const b2 = await bg();
  check("32 โทนกลางคืน พื้นการ์ดค่า hash ไม่สลับสีเมื่อหน้าวาดของใหม่ และกลับโทนสว่างแล้วไม่ค้างสีมืด", b0 === b1 && b2 === "rgb(255, 255, 255)" && b0 !== b2, `${b0} → ${b1} → ${b2}`);
};
T[126] = async (p, check) => {
  const src = await SRC("src/pages/check/CheckPage.tsx");
  check("126 ปุ่มดูกราฟเสียงช่วงนี้ไม่นับช่วงขาดท้ายที่เขียนว่าภาพเสียงจบ", src.includes(`spans.find((sp) => !sp.tail && sp.what.includes("เสียง"))`));
};
T[127] = async (p, check) => {
  await nav(p, "MediaInfo"); await wait(p, 300); await avDrop(p, MOVIE); await wait(p, 1200);
  await over(p, "hash_running", `return true;`);
  await nav(p, "ชั้นวางหนัง"); await wait(p, 300); await nav(p, "MediaInfo"); await wait(p, 600);
  const on = await p.evaluate(() => !!document.querySelector("[data-hash-elsewhere]"));
  check("127 งานค่า hash ที่เริ่มจากหน้าอื่นระหว่างไปเมนูอื่น กลับมาหน้าที่เปิดค้างแล้วการ์ดเหลืองขึ้น", on, on);
};
T[113] = async (p, check) => {
  await nav(p, "ตั้งค่า"); await p.waitForSelector("[data-setnav=graph]"); await click(p, "[data-setnav=graph]"); await wait(p, 300);
  await clickText(p, "TIFF"); await wait(p, 200); await clickText(p, "16 bit"); await wait(p, 200);
  await clickText(p, "7680"); await wait(p, 300);
  const t = await p.evaluate(() => document.querySelector("[data-img-bits-note]")?.innerText ?? null);
  if (process.env.SHOTS) { await p.evaluate(() => document.querySelector("[data-img-row=bits]")?.scrollIntoView({ block: "center" })); await wait(p, 200); await p.screenshot({ path: `${process.env.SHOTS}/ข้อ-113-เตือน.png` }); }
  await clickText(p, "1920"); await wait(p, 300);
  const t2 = await p.evaluate(() => document.querySelector("[data-img-bits-note]")?.innerText ?? null);
  await clickText(p, "8 bit"); await clickText(p, "PNG"); await clickText(p, "ตามจอ");
  check("113 TIFF 16 bit กว้าง 7680 เตือนแรมตอนบันทึก กว้าง 1920 ไม่เตือน", !!t && /แรม/.test(t) && /MB/.test(t) && t2 === null, `${t} | ${t2}`);
};
T[139] = async (p, check) => {
  await p.evaluate(() => [...document.querySelectorAll(".book")][0]?.click()); await wait(p, 300);
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => !b.closest("[data-navbar]") && b.innerText.trim() === "MediaInfo")?.click()); await wait(p, 600);
  const info = await p.evaluate(() => !!document.querySelector("[data-hash]"));
  await nav(p, "MediaInfo"); await wait(p, 300); await click(p, "[data-mi-shelf]"); await wait(p, 600);
  const r = await p.evaluate(() => ({ shelf: document.querySelectorAll(".book").length, info: !!document.querySelector("[data-hash]") }));
  check("139 ปุ่มเลือกจากชั้นวางในหน้า MediaInfo พาไปชั้นวาง ไม่ไปหน้าข้อมูลไฟล์ของเรื่องเก่า", info && r.shelf > 0 && !r.info, JSON.stringify({ info, ...r }));
};

// ---------------------------------------------------------------- ตัวรัน
const want = process.argv.slice(2).map(Number).filter(Boolean);
const ids = Object.keys(T).map(Number).filter((n) => !want.length || want.includes(n)).sort((a, b) => a - b);
let pass = 0, fail = 0;
const check = (name, ok, detail) => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : `  →  ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`); };
let vite = null;
if (!(await up())) {
  vite = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["vite", "--port", "1420", "--strictPort"], { stdio: "ignore", shell: process.platform === "win32" });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
}
const { chromium } = createRequire(import.meta.url)("playwright");
const b = await chromium.launch();
try {
  for (const n of ids) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(URL); await p.waitForSelector("[data-navbar]"); await wait(p, 1500);
    // ตัวเดิมของคำสั่งที่สลับ เรียกจากตัวสลับได้ (window.__fxOverBase)
    await p.evaluate(() => { window.__fxOverBase = new Proxy({}, { get: (_, c) => (a) => { const o = window.__fxOver; window.__fxOver = undefined; const r = window.__TAURI_INTERNALS__.invoke(c, a); window.__fxOver = o; return r; } }); });
    try { await T[n](p, check); } catch (e) { check(`${n} ตรวจจบไม่ได้`, false, e.message.split("\n")[0]); }
    if (process.env.SHOTS) await p.screenshot({ path: `${process.env.SHOTS}/ข้อ-${n}.png` }).catch(() => {});
    if (errs.length) check(`${n} ไม่มีข้อผิดพลาดในหน้า`, false, errs.join(" | "));
    await p.close();
  }
} finally { await b.close(); vite?.kill(); }
console.log(`\nผ่าน ${pass} ตก ${fail}`);
process.exit(fail ? 1 : 0);
