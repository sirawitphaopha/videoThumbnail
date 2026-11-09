// เทสขั้น 3 เปลี่ยนชื่อไฟล์ ในหน้าต่างโปรแกรมจริง ผ่านพอร์ตดีบัก (แผนขั้น 3 ตารางตรวจผล · สเปกข้อ 2)
// ทั้ง 6 สถานะกับไฟล์จริง · เปลี่ยนแค่ตัวพิมพ์เล็กใหญ่ได้ · ชื่อสงวน ชื่อยาวเกิน บันทึกไม่ได้
// ไฟล์ถูกเปิดค้างขึ้นสถานะ ⑥ · hash ทุกไฟล์ในโฟลเดอร์ก่อนและหลังเท่ากัน ไม่มีไฟล์ไหนโดนทับ
// ใช้: node scripts/check-stage3.mjs  (โปรแกรมเปิดผ่าน scripts/dev-app.ps1 · ไฟล์ทดสอบสร้างจาก node scripts/make-test-media.mjs)
import { mkdirSync, writeFileSync, readdirSync, copyFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { connect, sleep } from "./lib/cdp-client.mjs";

const SRC = join("test-media", "สร้าง", "หนัง");
const DIR = "D:\\dev\\tmp\\ชั้นเปลี่ยนชื่อ";
const OUT = "docs/report-2026-11-06/ขั้น3";
mkdirSync(OUT, { recursive: true });
if (!existsSync(SRC)) { console.log("ไม่มีไฟล์ทดสอบ รัน node scripts/make-test-media.mjs ก่อน"); process.exit(1); }

// โฟลเดอร์ทดสอบของขั้นนี้ สร้างใหม่ทุกครั้ง · ไฟล์ซับชื่อเดียวกับหนังไว้เช็กว่าไม่โดนแตะ
rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
for (const f of ["ดาวเหนือ (2023).mkv", "ขาดท้าย (2022).mkv", "Iron Tide (2024).avi", "เสียกลางเรื่อง (2022).mkv", "The Last Orchard (2022).mp4"]) copyFileSync(join(SRC, f), join(DIR, f));
writeFileSync(join(DIR, "ดาวเหนือ (2023).srt"), "1\n00:00:01,000 --> 00:00:02,000\nซับทดสอบ\n");

const hashes = () => Object.fromEntries(readdirSync(DIR).map((f) => [f, createHash("sha256").update(readFileSync(join(DIR, f))).digest("hex")]));
const before = hashes();

const c = await connect();
const results = [];
const check = (name, pass, detail = "") => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? "✅" : "❌"} ${name}${detail ? " · " + detail : ""}`); };
const inv = (cmd, args = {}) => c.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(cmd)}, ${JSON.stringify(args)})`);
const q = (js) => c.evaluate(`(() => { ${js} })()`);
const shot = async (f, sel = ".detail", pad = 0) => { await c.move(100, 600); await sleep(250); return c.shot(`${OUT}/${f}`, sel, pad); };
async function waitScan() {
  await sleep(300);
  for (let i = 0; i < 300; i++) {
    const r = await inv("get_library");
    if (!r.scanning && !(await q("return !!document.querySelector('.topbar .btn-wait')"))) return r;
    await sleep(200);
  }
  throw new Error("รออ่านโฟลเดอร์เกินเวลา");
}
const idOf = async (name) => (await inv("get_library")).movies.find((m) => m.name === name)?.id;
const pick = async (name) => { await c.book(name); await sleep(250); };
const field = () => q("const i = document.querySelector('.rename input'); return i ? { value: i.value, focus: document.activeElement === i, ext: document.querySelector('.rename .inp .ext')?.innerText } : null");
const state = () => q(`const r = document.querySelector('.rename');
  return { open: !!r, err: !!r?.querySelector('.inp.err'), hint: r?.querySelector('#rename-hint')?.innerText ?? '', card: r?.querySelector('.stat.bad')?.innerText ?? '',
    save: [...(r?.querySelectorAll('.minirow .btn') ?? [])].map((b) => b.innerText + (b.classList.contains('btn-wait') ? '(กดไม่ได้)' : '')).join(' | '),
    renamed: document.querySelector('[data-renamed]')?.innerText ?? '', name: document.querySelector('.fname .nm')?.innerText ?? '' }`);
// พิมพ์แทนทั้งช่อง (เลือกทั้งหมดแล้วพิมพ์ทับ)
const retype = async (t) => { await c.evaluate("(() => { const i = document.querySelector('.rename input'); i.focus(); i.select(); })()"); await c.key("Delete"); if (t) await c.type(t); await sleep(350); };

// ---------- ตั้งโฟลเดอร์ทดสอบ ----------
await inv("set_settings", { patch: { folders: [DIR], viewMode: "grid", coverSize: "m", showNames: true, showDots: true, sort: "name-asc" } });
await c.evaluate("location.hash = ''; location.reload()");
await sleep(800);
await waitScan();
const daoId = await idOf("ดาวเหนือ (2023)");

// ① ก่อนกด · ชี้ดินสอแล้วเปลี่ยนสี
await pick("ดาวเหนือ (2023)");
const bg0 = await q("return getComputedStyle(document.querySelector('.fname .icon-btn')).backgroundColor");
await c.hover(".fname .icon-btn"); await sleep(250);
const bg1 = await q("return getComputedStyle(document.querySelector('.fname .icon-btn')).backgroundColor");
await c.shotRect(`${OUT}/01-ก่อนกด-ชี้ดินสอ.png`, ...(await q("const r = document.querySelector('.fname').getBoundingClientRect(); return [r.left - 10, r.top - 10, r.width + 20, r.height + 20]")));
check("① ชื่อพร้อมดินสอ ชี้ดินสอแล้วเปลี่ยนสี", bg0 !== bg1, `${bg0} → ${bg1}`);

// ② กดดินสอ · ชื่อกลายเป็นช่องพิมพ์ นามสกุลล็อก บอกชื่อใหม่
await c.click(".fname .icon-btn"); await sleep(300);
const f0 = await field();
await c.type(" 1080p"); await sleep(350);
const s2 = await state();
await shot("02-กำลังพิมพ์.png");
check("② กดดินสอแล้วเป็นช่องพิมพ์ ชื่อเดิมอยู่ในช่อง ขีดพิมพ์อยู่ท้ายชื่อ นามสกุล .mkv ล็อกไว้นอกช่อง", f0?.value === "ดาวเหนือ (2023)" && f0.focus && f0.ext === ".mkv", JSON.stringify(f0));
check("② พิมพ์ต่อท้ายแล้วบอกชื่อใหม่ ปุ่มบันทึกชื่อกดได้", s2.hint === "ชื่อใหม่ ดาวเหนือ (2023) 1080p.mkv" && s2.save === "บันทึกชื่อ | ยกเลิก" && !s2.err, `${s2.hint} · ${s2.save}`);

// ③ ชื่อซ้ำกับไฟล์ที่มีอยู่
await retype("ขาดท้าย (2022)");
const s3 = await state();
await c.key("Enter"); await sleep(400);
const still3 = existsSync(join(DIR, "ดาวเหนือ (2023).mkv"));
await shot("03-ชื่อซ้ำ.png");
check("③ ชื่อซ้ำ ช่องแดง บอกเหตุ ปุ่มบันทึกกดไม่ได้ กด Enter ไม่เกิดอะไร", s3.err && s3.hint === "ในโฟลเดอร์นี้มีไฟล์ชื่อนี้อยู่แล้ว ตั้งชื่ออื่น" && s3.save.startsWith("บันทึกชื่อ(กดไม่ได้)") && still3, `${s3.hint} · ${s3.save}`);

// ④ ตัวอักษรที่ Windows ห้ามใช้ บอกตัวที่มีจริง
await retype("ดาวเหนือ: ภาค 2?");
const s4 = await state();
await shot("04-ตัวอักษรต้องห้าม.png");
check("④ ตัวอักษรต้องห้าม ช่องแดง บอกตัวที่มีจริง ปุ่มบันทึกกดไม่ได้", s4.err && s4.hint === "ชื่อไฟล์ใช้ตัวอักษร \\ / : * ? \" < > | ไม่ได้\nตอนนี้มี : กับ ?" && s4.save.startsWith("บันทึกชื่อ(กดไม่ได้)"), s4.hint.replace("\n", " / "));

// ชื่อว่าง · ลงท้ายจุดหรือเว้นวรรค · ชื่อสงวน · ยาวเกิน (สเปกข้อ 12 บันทึกไม่ได้ ข้อความแบบเดียวกับ ④)
const rules = [];
for (const [t, want] of [["", "ชื่อไฟล์ว่างไม่ได้"], ["ดาวเหนือ.", "ชื่อไฟล์ลงท้ายด้วยจุดหรือเว้นวรรคไม่ได้"], ["CON", "ชื่อ CON ใช้ไม่ได้"], ["lpt1.ภาค 2", "ชื่อ lpt1 ใช้ไม่ได้"], ["ก".repeat(260), "ชื่อไฟล์ยาวเกินไป"], ["ข".repeat(250), "ชื่อยาวเกินไป"]]) {
  await retype(t);
  const s = await state();
  rules.push({ t: t.length > 20 ? `ยาว ${t.length} ตัว` : `"${t}"`, ok: s.err && s.hint.split("\n")[0] === want && s.save.startsWith("บันทึกชื่อ(กดไม่ได้)"), hint: s.hint.replace("\n", " / ") });
  if (t === "CON") await shot("04ข-ชื่อสงวน.png");
}
check("ชื่อว่าง ลงท้ายจุด ชื่อสงวน 2 แบบ ชื่อยาวเกิน ที่อยู่ยาวเกิน บันทึกไม่ได้ทุกแบบ", rules.every((r) => r.ok), rules.map((r) => `${r.t} → ${r.hint}`).join(" | "));

// Esc ยกเลิก ชื่อเดิม
await c.key("Escape"); await sleep(250);
const sEsc = await state();
check("Esc ยกเลิก ช่องพิมพ์ปิด ชื่อเดิม ไฟล์ไม่ถูกแตะ", !sEsc.open && sEsc.name === "ดาวเหนือ (2023).mkv" && existsSync(join(DIR, "ดาวเหนือ (2023).mkv")), sEsc.name);

// ⑤ สำเร็จ · Enter บันทึก ชื่อบนชั้นกับชื่อไฟล์จริงเปลี่ยนพร้อมกัน การ์ดเขียวหายเองใน 3 วินาที
await c.click(".fname .icon-btn"); await sleep(300);
await c.type(" 1080p"); await sleep(300);
await c.key("Enter"); await sleep(500);
const s5 = await state();
const onDisk5 = existsSync(join(DIR, "ดาวเหนือ (2023) 1080p.mkv")) && !existsSync(join(DIR, "ดาวเหนือ (2023).mkv"));
const shelf5 = await q("return { renamed: !!document.querySelector('.book[data-movie=\"ดาวเหนือ (2023) 1080p\"]'), old: !!document.querySelector('.book[data-movie=\"ดาวเหนือ (2023)\"]'), sel: document.querySelector('.book.sel')?.dataset.movie }");
await shot("05-สำเร็จ.png");
check("⑤ Enter บันทึก ไฟล์ในเครื่องเปลี่ยนชื่อ ชื่อบนชั้นกับแผงขวาเปลี่ยนตาม เรื่องเดิมยังถูกเลือก ขึ้นการ์ดเขียว", onDisk5 && shelf5.renamed && !shelf5.old && shelf5.sel === "ดาวเหนือ (2023) 1080p" && s5.name === "ดาวเหนือ (2023) 1080p.mkv" && s5.renamed.startsWith("เปลี่ยนชื่อไฟล์แล้ว"), `${s5.name} · ${s5.renamed.replace("\n", " / ")}`);
check("ประวัติตามชื่อใหม่ เลขประจำไฟล์เดิม", (await idOf("ดาวเหนือ (2023) 1080p")) === daoId, daoId);
await sleep(3200);
check("การ์ดเปลี่ยนชื่อสำเร็จหายเองใน 3 วินาที", !(await q("return !!document.querySelector('[data-renamed]')")));
// บั๊กที่เจอตอนเทส เปลี่ยนชื่อเสร็จแล้วหน้าจอค้างว่ากำลังอ่านโฟลเดอร์ ปุ่มดินสอกับปุ่มอ่านโฟลเดอร์ใหม่กดไม่ได้ตลอด
const idle = await q("return { refresh: document.querySelector('.topbar .btn-ghost')?.innerText ?? '', wait: !!document.querySelector('.topbar .btn-wait'), pencil: document.querySelector('.fname .icon-btn')?.className }");
check("เปลี่ยนชื่อเสร็จ ปุ่มอ่านโฟลเดอร์ใหม่กับปุ่มดินสอกดได้ตามปกติ", idle.refresh.includes("อ่านโฟลเดอร์ใหม่") && !idle.wait && idle.pencil === "icon-btn", JSON.stringify(idle));

// เปลี่ยนแค่ตัวพิมพ์เล็กใหญ่
await pick("Iron Tide (2024)");
await c.click(".fname .icon-btn"); await sleep(300);
await retype("IRON TIDE (2024)");
await c.key("Enter"); await sleep(500);
const caseNames = readdirSync(DIR).filter((f) => f.toLowerCase().startsWith("iron tide"));
check("เปลี่ยนแค่ตัวพิมพ์เล็กใหญ่ได้ ชื่อในเครื่องเป็นตัวพิมพ์ใหม่", caseNames.length === 1 && caseNames[0] === "IRON TIDE (2024).avi", caseNames.join(", "));

// ⑥ ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น · เปิดค้างแบบที่โปรแกรมเล่นหนังทำ (ยอมให้อ่าน ไม่ยอมให้เปลี่ยนชื่อ)
const heldPath = join(DIR, "เสียกลางเรื่อง (2022).mkv");
const holder = spawn("powershell", ["-NoProfile", "-Command", "$f=[IO.File]::Open($env:HOLD_PATH,'Open','Read','Read'); [Console]::Out.WriteLine('held'); [Console]::Out.Flush(); Start-Sleep -Seconds 60; $f.Close()"],
  { env: { ...process.env, HOLD_PATH: heldPath }, windowsHide: true });
await new Promise((ok, bad) => { holder.stdout.on("data", (d) => { if (String(d).includes("held")) ok(); }); holder.on("exit", () => bad(new Error("เปิดไฟล์ค้างไม่สำเร็จ"))); setTimeout(() => bad(new Error("เปิดไฟล์ค้างเกินเวลา")), 15000); });
await pick("เสียกลางเรื่อง (2022)");
await c.click(".fname .icon-btn"); await sleep(300);
await c.type(" ตัด"); await sleep(300);
await c.key("Enter"); await sleep(600);
const s6 = await state();
const focus6 = await q("return document.activeElement?.innerText ?? ''");
const untouched6 = existsSync(heldPath) && !existsSync(join(DIR, "เสียกลางเรื่อง (2022) ตัด.mkv"));
await shot("06-ไฟล์ถูกเปิดอยู่.png");
check("⑥ ไฟล์ถูกเปิดค้าง ขึ้นการ์ดแดง ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น ปุ่มลองใหม่ ยกเลิก ไฟล์ยังชื่อเดิม", s6.card.startsWith("ไฟล์ถูกเปิดอยู่ในโปรแกรมอื่น") && s6.card.includes("แถบนี้ไม่หายเอง") && s6.save === "ลองใหม่ | ยกเลิก" && focus6 === "ลองใหม่" && untouched6, s6.card.replace(/\n/g, " / "));
await sleep(3500);
check("⑥ การ์ดแดงไม่หายเอง", (await state()).card.startsWith("ไฟล์ถูกเปิดอยู่"));
holder.kill();
await new Promise((ok) => holder.on("exit", ok));
await sleep(300);
await c.click(".rename .minirow .btn"); await sleep(600);
const s6b = await state();
check("ปิดโปรแกรมที่เปิดไฟล์แล้วกดลองใหม่ เปลี่ยนชื่อสำเร็จ", existsSync(join(DIR, "เสียกลางเรื่อง (2022) ตัด.mkv")) && !existsSync(heldPath) && s6b.renamed.startsWith("เปลี่ยนชื่อไฟล์แล้ว"), s6b.name);

// กำลังอ่านโฟลเดอร์ เปลี่ยนชื่อไม่ได้ (ผลอ่านโฟลเดอร์จะเขียนทับคลังด้วยชื่อเก่า)
await c.click(".topbar .btn-ghost");
const busy = await q("const b = document.querySelector('.fname .icon-btn'); return { off: b?.classList.contains('off'), title: b?.title }");
await waitScan();
check("ระหว่างอ่านโฟลเดอร์ ปุ่มดินสอกดไม่ได้ บอกเหตุผล", busy.off && busy.title.includes("กำลังอ่านโฟลเดอร์อยู่"), busy.title);

// ไม่มีไฟล์ไหนโดนทับ · hash ทุกไฟล์ก่อนและหลังชุดเดียวกัน
const after = hashes();
const sortH = (o) => Object.values(o).sort().join();
const renamedMap = { "ดาวเหนือ (2023) 1080p.mkv": "ดาวเหนือ (2023).mkv", "IRON TIDE (2024).avi": "Iron Tide (2024).avi", "เสียกลางเรื่อง (2022) ตัด.mkv": "เสียกลางเรื่อง (2022).mkv" };
const pairOk = Object.entries(after).every(([f, h]) => before[renamedMap[f] ?? f] === h);
check("hash ทุกไฟล์ในโฟลเดอร์ก่อนและหลังเท่ากัน ไม่มีไฟล์ไหนโดนทับหรือหาย ไฟล์ซับไม่ถูกแตะ", Object.keys(after).length === Object.keys(before).length && sortH(after) === sortH(before) && pairOk && after["ดาวเหนือ (2023).srt"] === before["ดาวเหนือ (2023).srt"], `${Object.keys(after).length} ไฟล์`);
await shot("07-ชั้นหลังเปลี่ยนชื่อ.png", ".content", 0);

writeFileSync(`${OUT}/ผลเทส.json`, JSON.stringify(results, null, 2) + "\n");
const failed = results.filter((x) => !x.pass);
console.log(`\nผ่าน ${results.length - failed.length} จาก ${results.length}`);
c.close();
process.exit(failed.length ? 1 : 0);
