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
const SRC = async (file) => (await fetch(`${BASE}/${file}?raw`)).text();
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
